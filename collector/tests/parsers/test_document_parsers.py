import io
from pathlib import Path

import pytest
from openpyxl import Workbook
from pypdf import PdfReader, PdfWriter

from robopartpicker_collector.parsers.documents import (
    ParserLimitExceeded,
    UnsafeDocument,
    parse_document,
)


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "parsers"


@pytest.mark.parametrize(
    ("file_name", "content", "locator", "value"),
    [
        ("spec.html", b"<html><body><p>Torque: 12 N.m</p></body></html>", "html:line=1", "Torque: 12 N.m"),
        ("README.md", b"# Robot\n\nTorque: 12 N.m\n", "markdown:line=3", "Torque: 12 N.m"),
        ("spec.csv", b"field,value\ntorque,12 N.m\n", "csv:row=2:column=value", "12 N.m"),
        ("spec.tsv", b"field\tvalue\ntorque\t12 N.m\n", "tsv:row=2:column=value", "12 N.m"),
        ("spec.json", b'{"torque":"12 N.m"}', "json:/torque", "12 N.m"),
        ("spec.yaml", b"torque: 12 N.m\n", "yaml:/torque", "12 N.m"),
        ("spec.xml", b"<root><torque>12 N.m</torque></root>", "xml:/root/torque[1]", "12 N.m"),
    ],
)
def test_supported_text_formats_emit_exact_evidence_locators(
    file_name: str,
    content: bytes,
    locator: str,
    value: str,
) -> None:
    result = parse_document(file_name, content)

    assert result.format == Path(file_name).suffix.removeprefix(".").lower() or "markdown"
    assert any(span.locator == locator and span.value == value for span in result.evidence_spans)
    assert result.network_access is False


def test_xlsx_is_bounded_and_formula_cells_fail_closed() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "BOM"
    sheet.append(["part", "quantity"])
    sheet.append(["Actuator", 2])
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()

    result = parse_document("BOM.xlsx", output.getvalue())
    assert any(
        span.locator == "xlsx:sheet=BOM:cell=A2" and span.value == "Actuator"
        for span in result.evidence_spans
    )

    workbook = Workbook()
    sheet = workbook.active
    sheet["A1"] = "=HYPERLINK(\"https://example.invalid\")"
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    with pytest.raises(UnsafeDocument, match="formula"):
        parse_document("formula.xlsx", output.getvalue())


def test_xml_yaml_and_csv_active_content_fail_closed() -> None:
    with pytest.raises(UnsafeDocument, match="XML"):
        parse_document("attack.xml", (FIXTURES / "xxe.xml").read_bytes())
    with pytest.raises(UnsafeDocument, match="YAML"):
        parse_document("attack.yaml", (FIXTURES / "unsafe.yaml").read_bytes())
    with pytest.raises(UnsafeDocument, match="formula"):
        parse_document("attack.csv", b"name,value\nmotor,=WEBSERVICE(\"https://example.invalid\")\n")


def test_urdf_retains_structure_inertial_limits_and_missing_meshes() -> None:
    result = parse_document("fixture.urdf", (FIXTURES / "robot.urdf").read_bytes())
    robot = result.robot_description

    assert robot is not None
    assert robot.format == "urdf"
    assert robot.name == "fixture_robot"
    assert robot.units == {"length": "m", "angle": "rad", "mass": "kg"}
    assert [link["name"] for link in robot.links] == ["base_link", "arm_link"]
    assert robot.links[0]["mass"] == 3.5
    assert robot.links[0]["inertia"]["ixx"] == 0.1
    assert robot.joints == [
        {
            "name": "shoulder",
            "type": "revolute",
            "parent": "base_link",
            "child": "arm_link",
            "axis": [0.0, 0.0, 1.0],
            "limits": {
                "lower": -1.57,
                "upper": 1.57,
                "effort": 20.0,
                "velocity": 2.0,
            },
        },
    ]
    assert robot.mesh_references == ["package://fixture_description/meshes/base.stl"]
    assert robot.missing_assets == ["package://fixture_description/meshes/base.stl"]
    assert any(span.locator == "robot:joint=shoulder" for span in result.evidence_spans)


def test_robot_description_variants_are_detected_without_expansion_or_network() -> None:
    fixtures = {
        "macro.xacro": b'<robot xmlns:xacro="http://www.ros.org/wiki/xacro" name="x"><link name="base"/></robot>',
        "world.sdf": b'<sdf version="1.10"><model name="s"><link name="base"/></model></sdf>',
        "semantic.srdf": b'<robot name="s"><group name="arm"><joint name="shoulder"/></group></robot>',
        "model.mjcf": b'<mujoco model="m"><worldbody><body name="base"><joint name="hinge" type="hinge"/></body></worldbody></mujoco>',
    }

    assert {
        name: parse_document(name, content).robot_description.format
        for name, content in fixtures.items()
    } == {
        "macro.xacro": "xacro",
        "world.sdf": "sdf",
        "semantic.srdf": "srdf",
        "model.mjcf": "mjcf",
    }
    assert all(parse_document(name, content).network_access is False for name, content in fixtures.items())


def test_traversal_mesh_references_and_archives_are_rejected() -> None:
    with pytest.raises(UnsafeDocument, match="asset reference"):
        parse_document("traversal.urdf", (FIXTURES / "traversal.urdf").read_bytes())
    with pytest.raises(UnsafeDocument, match="archive"):
        parse_document("repository.zip", b"PK\x03\x04")


def test_native_cad_and_meshes_are_metadata_only() -> None:
    content = b"synthetic STEP bytes that are never executed"
    result = parse_document("assembly.step", content)

    assert result.evidence_spans == ()
    assert result.unsupported_format is not None
    assert result.unsupported_format.state == "metadata_only"
    assert result.unsupported_format.file_name == "assembly.step"
    assert result.unsupported_format.byte_size == len(content)
    assert len(result.unsupported_format.content_sha256) == 64


def test_pdf_metadata_is_read_but_encrypted_pdf_is_rejected() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    output = io.BytesIO()
    writer.write(output)
    result = parse_document("blank.pdf", output.getvalue())
    assert result.structured_data == {"pageCount": 1}

    reader = PdfReader(io.BytesIO(output.getvalue()))
    encrypted = PdfWriter()
    encrypted.append_pages_from_reader(reader)
    encrypted.encrypt("fixture-password")
    output = io.BytesIO()
    encrypted.write(output)
    with pytest.raises(UnsafeDocument, match="encrypted PDF"):
        parse_document("encrypted.pdf", output.getvalue())


def test_size_and_nesting_limits_fail_with_typed_errors() -> None:
    with pytest.raises(ParserLimitExceeded, match="byte limit"):
        parse_document("large.md", b"x" * (8 * 1024 * 1024 + 1))

    nested = b'{"a":' * 40 + b"0" + b"}" * 40
    with pytest.raises(ParserLimitExceeded, match="depth"):
        parse_document("nested.json", nested)


def test_non_finite_structured_numbers_are_rejected() -> None:
    with pytest.raises(UnsafeDocument, match="finite"):
        parse_document("nan.json", b'{"value": NaN}')
    with pytest.raises(UnsafeDocument, match="finite"):
        parse_document("nan.yaml", b"value: .nan\n")
