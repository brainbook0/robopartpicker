import json
from pathlib import Path

from robopartpicker_collector.cli import main


REPO = Path(__file__).resolve().parents[2]


def test_fixture_run_validates_and_writes_deterministic_outputs(tmp_path: Path, capsys) -> None:
    fixture = {
        "batch": json.loads((REPO / "contracts" / "examples" / "import-batch.v2.json").read_text()),
        "evidenceRegistrations": [
            json.loads((REPO / "contracts" / "examples" / "evidence-registration.v1.json").read_text()),
        ],
    }
    fixture_path = tmp_path / "fixture.json"
    fixture_path.write_text(json.dumps(fixture), encoding="utf8")
    output = tmp_path / "output"

    assert main([
        "fixture-run",
        "--fixture",
        str(fixture_path),
        "--contracts-root",
        str(REPO / "contracts"),
        "--output",
        str(output),
    ]) == 0

    first = (output / "import-batch.v2.json").read_bytes()
    assert main([
        "fixture-run",
        "--fixture",
        str(fixture_path),
        "--contracts-root",
        str(REPO / "contracts"),
        "--output",
        str(output),
    ]) == 0
    assert (output / "import-batch.v2.json").read_bytes() == first
    assert json.loads(capsys.readouterr().out.splitlines()[-1])["networkAccess"] is False
