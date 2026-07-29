# Collector parser matrix

All parsers are deterministic, network-free, byte-bounded, and return exact
evidence locators. They never execute source files, invoke a shell, expand
Xacro macros, resolve external XML entities, or fetch referenced assets.

## Supported formats and limits

| Format | Handling | Evidence locator | Primary limits |
| --- | --- | --- | --- |
| HTML | Text nodes | line | 8 MiB, 50,000 nodes, depth 32 |
| Markdown | Non-empty lines | line | 8 MiB, 100,000 lines |
| CSV / TSV | Data cells; formulas rejected | row and column | 8 MiB, 5,000 rows, 100 columns, 100,000 cells |
| XLSX | Read-only cells; formulas and external links rejected | sheet and cell | 8 MiB, 10 sheets, 5,000 rows, 100 columns, 100,000 cells, 16 MiB expansion |
| JSON | Safe scalar walk | JSON Pointer | 8 MiB, 50,000 nodes, depth 32 |
| YAML | `safe_load` scalar walk | YAML pointer | 8 MiB, 50,000 nodes, depth 32; unsafe tags and cycles rejected |
| XML | Defused XML | element path or attribute | 8 MiB, 50,000 nodes, depth 64; DTD, entities, and external references rejected |
| PDF | Text and page metadata | page | 25 MiB, 100 pages, 2,000,000 extracted characters; encrypted PDFs rejected |
| URDF / Xacro | Robot links, joints, limits, inertia, meshes | link or joint identifier | XML limits; no macro expansion or implicit asset fetch |
| SDF / SRDF / MJCF | Robot or semantic structure | link or joint identifier | XML limits; no implicit asset fetch |
| STEP/STP, IGES, native CAD, meshes, USD, DXF | Metadata only | none | 50 MiB; never executed |
| ZIP/TAR/GZ/7Z/RAR | Rejected | none | No archive expansion |

Robot-description asset references allow bounded `package://`, `model://`, or
safe relative paths. Absolute, traversal, file, HTTP, query-bearing, and
backslash paths fail closed. Referenced assets are reported missing until a
separately retained file manifest proves their presence.

## Locked parser dependencies

| Package | Version | License | Source decision |
| --- | --- | --- | --- |
| `defusedxml` | 0.7.1 | PSF | PyPI describes defenses for entity expansion, DTD, and external-reference attacks. |
| `openpyxl` | 3.1.5 | MIT | PyPI identifies 3.1.5 as the stable release and explicitly recommends `defusedxml` for XML bomb protection. |
| `pypdf` | 6.14.2 | BSD-3-Clause | PyPI lists 6.14.2 as the current stable release and supports Python 3.13. |

Primary package records:
[defusedxml](https://pypi.org/project/defusedxml/),
[openpyxl](https://pypi.org/project/openpyxl/), and
[pypdf](https://pypi.org/project/pypdf/).

## Malicious fixture hashes

| Fixture | SHA-256 | Expected state |
| --- | --- | --- |
| `xxe.xml` | `20545a4b2656c8423dc1fcd612c10e4af6bf3946d1036830247bdb68fd735abe` | Rejected DTD/entity |
| `unsafe.yaml` | `7b9faf60a1d36a3f163f60108d45ea74fdb717762f53c9f81ce81c7f6e6a70e7` | Rejected unsafe constructor |
| `traversal.urdf` | `2aa108f08c3beb5a8331a188e3a06619f48f39c3be9a75d020b64b14f2b5e6f3` | Rejected traversal reference |
| `robot.urdf` | `84d4278f94e84ee9ef6dd42dda6343da801cb1c1a1ae6c9e19f29682006f56d3` | Accepted structure fixture |
