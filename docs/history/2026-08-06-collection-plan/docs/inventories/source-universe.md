<!-- markdownlint-disable MD013 MD034 MD060 -->

# Source universe candidate inventory

Status: candidate discovery inventory only. Nothing in this file is approved for scraping, reuse, retention, automation, or live scheduling. Each source needs identity resolution, robots/terms/reuse review, access-method confirmation, rate/cost budget, fixture approval, and pilot approval under [`../robopartpicker-data-collection-plan.md`](../robopartpicker-data-collection-plan.md).

## Basis and guardrails

- Legacy baseline: [`legacy-source-index.md`](legacy-source-index.md) reports 309 cleaned source mentions, 227 distinct normalized labels, and 35 inventory sections with source lists from the preserved legacy inventory.
- Canonical plan constraints: source registry fields, provenance, policy state, robots/terms review, append-only observations, no bypassing authentication/paywalls/anti-bot controls, repository-by-reference rather than whole-repo mirroring, and explicit missing/ambiguous states.
- Internet research route used: agent-reach doctor showed GitHub via `gh CLI`, web via Jina Reader, RSS via `feedparser`, YouTube via `yt-dlp`, Bilibili search API, V2EX API. Exa, Reddit, X, Facebook, Instagram, Xiaohongshu, LinkedIn, and Xueqiu were unavailable or unconfigured in this environment.
- Search caveat: generic web search returned blocked/empty results here, so primary evidence below emphasizes stable known canonical homepages, API/documentation pages, directories, feeds, and GitHub/repository locators that still need verification.

## Preferred interface vocabulary

`official API`, `partner API`, `catalog API`, `static HTML`, `rendered HTML`, `files/PDF`, `CAD download`, `repository API`, `package API`, `RSS/Atom`, `forum API`, `video transcript`, `manual export`, `metadata-only`, `link-only pending review`.

## Manufacturers and component categories

All rows are candidates. Coverage is expected evidence, not approval or permission.

### Actuators, motors, servos, integrated joints

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| T-Motor | https://store.tmotor.com/ | UAV/robotics motors, specs, dimensions, datasheets, pricing | static/rendered HTML, files/PDF | Legacy actuator source |
| CubeMars | https://www.cubemars.com/ | AK/R series actuators, motors, controllers, datasheets | static HTML, files/PDF | Legacy actuator source |
| MYACTUATOR | https://www.myactuator.com/ | RMD/X series actuators, torque/speed/protocol specs | static HTML, files/PDF | Legacy actuator source |
| INNFOS | https://www.innfos.com/ | intelligent actuators and robot joints | static/rendered HTML, files/PDF | Legacy actuator source |
| ROBOTIS DYNAMIXEL | https://emanual.robotis.com/docs/en/dxl/ | DYNAMIXEL servo specs, protocols, CAD, control tables | official docs HTML, files | Legacy actuator source |
| maxon Group | https://www.maxongroup.com/ | motors, gearheads, encoders, controllers | catalog site, files/PDF, CAD download | Legacy actuator source |
| Harmonic Drive LLC | https://www.harmonicdrive.net/ | strain-wave gears and actuator assemblies | catalog HTML, files/PDF, CAD download | Legacy actuator/reducer source |
| TQ RoboDrive | https://www.tq-robodrive.com/ | frameless motors and servo kits | static HTML, files/PDF | Legacy actuator source |
| Kollmorgen | https://www.kollmorgen.com/ | servo motors, drives, motion control | catalog HTML, files/PDF | Legacy actuator source |
| MJBots moteus | https://mjbots.com/ | moteus controllers, qdd actuators, docs, firmware | static HTML, repository | Legacy compute/controller source |
| ODrive Robotics | https://odriverobotics.com/ | motor controllers, firmware, docs, specs | official docs, repository | Legacy controller source |
| Elmo Motion Control | https://www.elmomc.com/ | servo drives and motion controllers | catalog HTML, files/PDF | Legacy controller source |
| Trinamic / Analog Devices | https://www.analog.com/en/product-category/motor-control-hardware-platforms.html | motor-driver ICs/modules, eval boards, datasheets | catalog HTML, files/PDF | Legacy controller source |

### Hands, grippers, and end effectors

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| Shadow Robot | https://www.shadowrobot.com/ | anthropomorphic robot hands, specs, tactile options | static HTML, files/PDF | Legacy gripper source |
| SCHUNK | https://schunk.com/ | grippers, rotary modules, end-effectors, CAD | catalog HTML, CAD download, files/PDF | Legacy gripper source |
| Robotiq | https://robotiq.com/ | 2F/3F grippers, force-torque sensors, manuals | docs HTML, files/PDF | Legacy gripper/sensor source |
| Barrett Technology | https://www.barrett.com/ | BarrettHand, WAM arm, documentation | static HTML, files/PDF | Legacy gripper source |
| Inspire Robots | https://www.inspire-robots.com/ | dexterous hands and grippers | static/rendered HTML, files/PDF | Legacy gripper source |
| Psyonic | https://www.psyonic.io/ | Ability Hand specs and integration claims | static HTML, files/PDF | Legacy gripper source |
| Wonik Robotics | https://www.wonikrobotics.com/ | Allegro Hand and dexterous manipulation hardware | static HTML, files/PDF | Legacy gripper source |
| qbrobotics | https://www.qbrobotics.com/ | soft grippers, hands, actuators | static HTML, files/PDF | Legacy gripper source |
| Seed Robotics | https://www.seedrobotics.com/ | RH8D hand and robotics hands | static HTML, files/PDF | Legacy gripper source |
| Clone Robotics | https://clonerobotics.com/ | biomimetic hands/robots, public specs where available | static/rendered HTML, media | Legacy gripper source |

### Sensors

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| ATI Industrial Automation | https://www.ati-ia.com/ | force/torque sensors, tool changers, CAD, datasheets | catalog HTML, files/PDF | Legacy sensor source |
| Stereolabs | https://www.stereolabs.com/ | ZED cameras, SDKs, specs | docs HTML, SDK downloads, repository | Legacy sensor source |
| Intel RealSense | https://www.intelrealsense.com/ | depth cameras, SDK, firmware, docs | docs HTML, repository, files | Legacy sensor source |
| Luxonis | https://www.luxonis.com/ | OAK depth/AI cameras, specs, docs | docs HTML, repository | Legacy sensor source |
| Orbbec | https://www.orbbec.com/ | depth cameras and SDKs | catalog HTML, docs, files/PDF | Legacy sensor source |
| Roboception | https://roboception.com/ | 3D cameras, navigation sensors, docs | static HTML, files/PDF | Legacy sensor source |
| GelSight | https://www.gelsight.com/ | tactile sensors and measurement systems | static HTML, files/PDF | Legacy sensor source |
| Contactile | https://contactile.com/ | tactile sensing modules and grippers | static HTML, files/PDF | Legacy sensor source |
| SynTouch | https://syntouchinc.com/ | BioTac tactile sensors and data | static HTML, files/PDF | Legacy sensor source |
| Movella Xsens | https://www.movella.com/products/xsens | IMUs and motion capture | catalog HTML, files/PDF | Legacy sensor source |
| VectorNav | https://www.vectornav.com/ | IMUs, GNSS/INS sensors, specs | catalog HTML, files/PDF | Legacy sensor source |
| Renishaw | https://www.renishaw.com/ | encoders and metrology components | catalog HTML, files/PDF, CAD | Legacy sensor source |
| SICK | https://www.sick.com/ | LiDAR, safety scanners, encoders | catalog HTML, files/PDF, CAD | Legacy safety/sensor source |
| Ouster | https://ouster.com/ | 3D lidar sensors, specs, SDK | docs, files/PDF, repository | High-value addition |
| Hokuyo | https://www.hokuyo-aut.jp/ | 2D lidar and range sensors | static HTML, files/PDF | High-value addition |
| RPLIDAR / Slamtec | https://www.slamtec.com/en/Lidar | low-cost lidar, SDKs | docs, files/PDF, repository | High-value addition |

### Compute, embedded boards, safety, power, and hardware

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| NVIDIA Jetson | https://developer.nvidia.com/embedded/jetson-modules | modules, dev kits, compute specs, software | official docs, files/PDF | Legacy compute source |
| Raspberry Pi | https://www.raspberrypi.com/products/ | SBCs, specs, documentation | static HTML, docs, files/PDF | Legacy compute source |
| Intel NUC | https://www.intel.com/content/www/us/en/products/details/nuc.html | embedded/mini PCs, specs | catalog HTML, files/PDF | Legacy compute source |
| Arduino | https://www.arduino.cc/ | microcontrollers, docs, libraries | docs HTML, package registry, repository | Legacy MCU source |
| Espressif ESP32 | https://www.espressif.com/en/products/socs/esp32 | MCUs, SDKs, datasheets | docs HTML, files/PDF, repository | Legacy MCU source |
| PJRC Teensy | https://www.pjrc.com/teensy/ | Teensy boards, specs, libraries | static HTML, files | Legacy MCU source |
| STMicroelectronics STM32 | https://www.st.com/en/microcontrollers-microprocessors/stm32-32-bit-arm-cortex-mcus.html | STM32 MCUs, datasheets, tools | catalog HTML, files/PDF | Legacy MCU source |
| Pilz | https://www.pilz.com/ | safety relays, controllers, sensors | catalog HTML, files/PDF | Legacy safety source |
| Omron Industrial Automation | https://automation.omron.com/ | safety components, sensors, relays | catalog HTML, files/PDF | Legacy safety source |
| Banner Engineering | https://www.bannerengineering.com/ | safety and sensing components | catalog HTML, files/PDF | Legacy safety source |
| HobbyKing | https://hobbyking.com/ | LiPo packs, chargers, RC power parts | rendered HTML, manual export | Legacy battery source |
| BatterySpace | https://www.batteryspace.com/ | cells, packs, BMS, chargers | static/rendered HTML | Legacy battery source |
| Dakota Lithium | https://dakotalithium.com/ | LiFePO4 batteries and specs | static HTML | Legacy battery source |
| McMaster-Carr | https://www.mcmaster.com/ | hardware, bearings, fasteners, materials, CAD | rendered HTML, manual export, CAD | Legacy structural/hardware source |
| MISUMI | https://us.misumi-ec.com/ | configurable mechanical components and CAD | catalog HTML, CAD download | Legacy structural/hardware source |
| 80/20 | https://8020.net/ | aluminum extrusion, fasteners, CAD | catalog HTML, CAD download | Legacy structural source |
| OpenBuilds Part Store | https://openbuildspartstore.com/ | extrusion, linear motion, CNC/robot parts | static/rendered HTML | Legacy structural source |
| SKF | https://www.skf.com/ | bearings, seals, product data | catalog HTML, files/PDF | Legacy hardware source |
| NSK | https://www.nsk.com/ | bearings, linear guides | catalog HTML, files/PDF | Legacy hardware source |
| Bolt Depot | https://www.boltdepot.com/ | fasteners dimensions and pricing | static HTML | Legacy hardware source |
| Amphenol | https://www.amphenol.com/ | connectors and cables | catalog HTML, files/PDF | Legacy connector source |
| Molex | https://www.molex.com/ | connectors, cables, CAD/models | catalog HTML, files/PDF | Legacy connector source |
| JST | https://www.jst.com/ | connectors and datasheets | static HTML, files/PDF | Legacy connector source |
| TE Connectivity | https://www.te.com/ | connectors, sensors, relays | catalog HTML, files/PDF, CAD | Legacy connector source |

### Complete robots and reference products

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| Unitree Robotics | https://www.unitree.com/ | quadrupeds, humanoids, SDK links, specs | static/rendered HTML, repository | Legacy complete-robot source |
| Fourier Intelligence | https://www.fftai.com/ | humanoid and rehab robot specs | static HTML | Legacy complete-robot source |
| Agility Robotics | https://agilityrobotics.com/ | Digit robot public specs and announcements | static HTML, RSS/news | Legacy complete-robot source |
| Figure AI | https://www.figure.ai/ | humanoid robot announcements/specs where public | static HTML, news | Legacy complete-robot source |
| Tesla Optimus | https://www.tesla.com/AI | humanoid robot announcements | static/rendered HTML, media | Legacy complete-robot source |
| Boston Dynamics | https://bostondynamics.com/ | Spot, Stretch, Atlas public specs/docs | static HTML, docs, files | Legacy complete-robot source |
| Apptronik | https://apptronik.com/ | Apollo humanoid public specs | static HTML | Legacy complete-robot source |
| 1X Technologies | https://www.1x.tech/ | humanoid/consumer robots public specs | static HTML, news | Legacy complete-robot source |
| Sanctuary AI | https://sanctuary.ai/ | Phoenix humanoid public specs/news | static HTML, news | Legacy complete-robot source |

## Distributors, aggregators, and catalog APIs

| Candidate | Canonical URL | Coverage | Preferred access interface | Primary evidence |
|---|---|---|---|---|
| DigiKey | https://www.digikey.com/ | authorized electronics catalog, price, stock, datasheets | official API, catalog HTML | API portal: https://developer.digikey.com/ |
| Mouser Electronics | https://www.mouser.com/ | electronics catalog, pricing, stock, datasheets | official API, catalog HTML | API docs: https://api.mouser.com/ |
| Octopart | https://octopart.com/ | distributor aggregation, price/stock, lifecycle | partner API | API docs: https://octopart.com/api |
| Newark / element14 / Farnell | https://www.newark.com/ | electronics catalog and offers | catalog API/manual, static HTML | Developer/API entry: https://partner.element14.com/ |
| RS | https://www.rs-online.com/ | industrial/electronics catalog | catalog HTML, files/PDF | Candidate supplier directory |
| Arrow Electronics | https://www.arrow.com/ | electronics catalog, datasheets, stock | catalog API/HTML | API docs: https://www.arrow.com/api/ |
| TTI | https://www.tti.com/ | connectors/electromechanical parts | catalog HTML | Candidate supplier directory |
| Avnet | https://www.avnet.com/ | electronics distribution | catalog HTML/API where approved | Candidate supplier directory |
| RobotShop | https://www.robotshop.com/ | robotics parts, kits, reviews, pricing | static/rendered HTML, manual export | Legacy supplier/review source |
| Trossen Robotics | https://www.trossenrobotics.com/ | robotics kits, DYNAMIXEL, arms, parts | static/rendered HTML | Legacy supplier source |
| Generation Robots | https://www.generationrobots.com/ | EU robotics distributor, robots, sensors, parts | rendered HTML | Legacy supplier source |
| Active Robots | https://www.active-robots.com/ | UK robotics distributor | rendered HTML | Legacy supplier source |
| SparkFun | https://www.sparkfun.com/ | sensors, boards, tutorials, specs | product API/HTML, GitHub | Legacy sensor/MCU source |
| Adafruit | https://www.adafruit.com/ | sensors, boards, guides, libraries | product HTML/API where approved, GitHub | Legacy sensor/MCU source |
| ServoCity | https://www.servocity.com/ | Actobotics/goBILDA drivetrain parts | static/rendered HTML, files/CAD | Legacy drivetrain source |
| AndyMark | https://www.andymark.com/ | FRC drivetrain, motors, wheels, hardware | static/rendered HTML, files | Legacy drivetrain source |
| VEX Robotics / VEXpro | https://www.vexrobotics.com/ | robotics motors, gears, control systems | static HTML, files | Legacy drivetrain source |
| SuperDroid Robots | https://www.superdroidrobots.com/ | mobile robots, tracks, wheels, kits | static/rendered HTML | Legacy drivetrain source |
| Thomasnet | https://www.thomasnet.com/ | manufacturer/supplier directory | directory HTML, manual review | Legacy manufacturer directory |
| GlobalSpec | https://www.globalspec.com/ | engineering supplier and product directories | directory HTML | High-value addition |

## Specialist retailers and marketplaces

| Candidate | Canonical URL | Coverage | Preferred access interface | Notes |
|---|---|---|---|---|
| AliExpress | https://www.aliexpress.com/ | low-cost motors, reducers, controllers, batteries | rendered HTML/manual, link-only pending review | Legacy marketplace source, high policy risk |
| Alibaba | https://www.alibaba.com/ | OEM supplier listings and RFQ data | rendered HTML/manual, link-only pending review | Legacy RFQ source, high policy risk |
| Amazon | https://www.amazon.com/ | tools, components, reviews, offers | manual export/link-only pending review | Legacy marketplace source, high policy risk |
| eBay | https://www.ebay.com/ | used robotics parts, surplus, offers | marketplace API/manual | Legacy marketplace source |
| LabX | https://www.labx.com/ | used lab/industrial equipment | rendered HTML/manual | Legacy surplus source |
| GovDeals | https://www.govdeals.com/ | government surplus equipment | rendered HTML/manual | Legacy surplus source |
| IndiaMART | https://www.indiamart.com/ | regional supplier listings and RFQ | rendered HTML/manual | Legacy RFQ source |
| University surplus stores | varies by institution | used robots, sensors, lab equipment | manual discovery | Legacy surplus family |
| ROS Discourse Marketplace | https://discourse.ros.org/c/jobs/marketplace/17 | robotics job/marketplace/vendor posts | forum API/RSS | Legacy marketplace/community source |

## Fabrication and manufacturing services

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| SendCutSend | https://sendcutsend.com/ | sheet metal, CNC routing, materials, tolerances | static HTML, files | Legacy fabrication source |
| Protolabs | https://www.protolabs.com/ | CNC, injection molding, 3D printing | static HTML, files | Legacy fabrication source |
| Xometry | https://www.xometry.com/ | manufacturing marketplace, process capabilities | static/rendered HTML | Legacy fabrication source |
| JLCPCB | https://jlcpcb.com/ | PCB, PCBA, CNC, 3D printing capabilities | static/rendered HTML, files | Legacy fabrication source |
| PCBWay | https://www.pcbway.com/ | PCB, assembly, CNC/3D printing | static/rendered HTML | Legacy fabrication source |
| Shapeways | https://www.shapeways.com/ | 3D-print services/materials | rendered HTML | Legacy fabrication source |
| Hubs | https://www.hubs.com/ | CNC, sheet metal, 3D printing | static HTML | High-value addition |
| Oshpark | https://oshpark.com/ | PCB fabrication | static HTML/API if approved | High-value addition |
| MacroFab | https://www.macrofab.com/ | PCB assembly/manufacturing | static HTML/API if approved | High-value addition |

## Open-source projects, repositories, SDKs, and drivers

Prefer repository APIs and path-limited file retrieval. Do not mirror whole repositories by default.

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| GitHub search/topics | https://github.com/topics/robotics | project discovery, repositories, BOMs, URDF/SDF files | GitHub REST/GraphQL API | Legacy source family |
| GitLab explore | https://gitlab.com/explore/projects/topics/robotics | project discovery and repos | GitLab API | Legacy source family |
| ROS Index | https://index.ros.org/ | ROS packages, repos, docs, dependencies | static HTML/API-like index | Legacy source family |
| ROS 2 docs | https://docs.ros.org/ | package docs and generated APIs | static HTML | High-value addition |
| Open Robotics Gazebo | https://gazebosim.org/ | simulation assets, SDF/Gazebo docs | docs/repository | High-value addition |
| ROBOTIS-GIT | https://github.com/ROBOTIS-GIT | DYNAMIXEL SDK, TurtleBot, OpenMANIPULATOR | GitHub API | Manufacturer GitHub source |
| Intel RealSense GitHub | https://github.com/IntelRealSense | SDKs, ROS wrappers, firmware-adjacent docs | GitHub API | Manufacturer GitHub source |
| Luxonis GitHub | https://github.com/luxonis | DepthAI SDK and examples | GitHub API | Manufacturer GitHub source |
| Unitree Robotics GitHub | https://github.com/unitreerobotics | SDKs and examples | GitHub API | Complete-robot source |
| ODrive Robotics GitHub | https://github.com/odriverobotics | firmware, tools, docs | GitHub API | Controller source |
| mjbots GitHub | https://github.com/mjbots | moteus firmware/tools, qdd projects | GitHub API | Controller/actuator source |
| InMoov | https://inmoov.fr/ | open humanoid robot build docs, parts, STL | static HTML, files | Legacy open-source project |
| Poppy Project | https://www.poppy-project.org/ | open-source humanoid/torso projects, docs | static HTML, repositories | Legacy open-source project |
| Open Duck Mini | https://github.com/apirrone/Open_Duck_Mini | open biped/humanoid robot files | GitHub API | High-value addition |
| Stanford Pupper | https://github.com/stanfordroboticsclub/StanfordQuadruped | quadruped BOM/code/CAD | GitHub API | High-value addition |
| OpenQuadruped / Mini Pupper | https://github.com/mangdangroboticsclub/mini_pupper | quadruped robot hardware/software | GitHub API | High-value addition |
| MIT Mini Cheetah | https://github.com/mit-biomimetics/Cheetah-Software | legged robot software and references | GitHub API | Legacy BOM source family |
| PAL Robotics repos | https://github.com/pal-robotics | ROS robot descriptions and drivers | GitHub API | High-value addition |
| Clearpath Robotics repos | https://github.com/clearpathrobotics | mobile robot ROS packages and descriptions | GitHub API | High-value addition |
| Universal Robots ROS Driver | https://github.com/UniversalRobots/Universal_Robots_ROS_Driver | robot driver, URDF, docs | GitHub API | High-value addition |
| MoveIt | https://github.com/moveit/moveit2 | planning ecosystem dependencies/examples | GitHub API | High-value addition |
| Dynamixel Workbench | https://github.com/ROBOTIS-GIT/dynamixel-workbench | DYNAMIXEL integration examples | GitHub API | Legacy integration source |
| NVIDIA Isaac ROS | https://github.com/NVIDIA-ISAAC-ROS | perception/manipulation packages, docs | GitHub API | Legacy integration source |

## CAD, digital twins, datasets, and model repositories

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| GrabCAD Library | https://grabcad.com/library | CAD models and mechanical examples | rendered HTML/manual, link-only pending license | Legacy CAD source |
| Thingiverse | https://www.thingiverse.com/ | printable robot parts and variants | rendered HTML/API if approved | Legacy CAD source |
| Onshape Public Documents | https://cad.onshape.com/documents?resourceType=filter&nodeId=Public | public CAD documents | rendered HTML/API if approved | Legacy CAD source |
| TraceParts | https://www.traceparts.com/ | supplier CAD models | catalog/CAD download | High-value addition |
| 3D ContentCentral | https://www.3dcontentcentral.com/ | supplier/user CAD models | catalog/CAD download | High-value addition |
| CADENAS PARTcommunity | https://b2b.partcommunity.com/ | manufacturer CAD catalogs | catalog/CAD download | High-value addition |
| YCB Object and Model Set | https://www.ycbbenchmarks.com/ | manipulation object meshes/dataset | static HTML/files | High-value dataset addition |
| Google Scanned Objects | https://app.ignitionrobotics.org/GoogleResearch/fuel/collections/Google%20Scanned%20Objects | object meshes for simulation | repository/dataset API | High-value dataset addition |
| Gazebo Fuel | https://app.gazebosim.org/fuel | simulation models/worlds | official web/API where available | High-value dataset addition |
| MuJoCo Menagerie | https://github.com/google-deepmind/mujoco_menagerie | MJCF robot models | GitHub API | High-value CAD/digital-twin addition |
| Robot Descriptions | https://github.com/robot-descriptions/robot_descriptions.py | curated URDF/MJCF description references | GitHub API, package API | High-value addition |
| Awesome Robotics Libraries | https://github.com/jslee02/awesome-robotics-libraries | discovery list for packages/projects | GitHub API | Discovery feed |

## Package registries

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| PyPI | https://pypi.org/ | robotics SDKs, drivers, parsers | JSON API / Simple API | Legacy package source |
| npm | https://www.npmjs.com/ | robotics/web/CAD tooling packages | registry API | Legacy package source |
| crates.io | https://crates.io/ | Rust robotics/control/CAN packages | official API | High-value addition |
| ROS package index | https://index.ros.org/ | ROS packages by distro/repository | static/index API pattern | Legacy source |
| Docker Hub | https://hub.docker.com/ | robotics/simulation container images | registry API | High-value addition |
| GitHub Container Registry | https://ghcr.io/ | project container images | package API | High-value addition |
| Conda-forge | https://conda-forge.org/packages/ | robotics/simulation/data packages | package index/API | High-value addition |
| Arduino Library Registry | https://www.arduino.cc/reference/en/libraries/ | microcontroller libraries | static/registry JSON if approved | High-value addition |
| PlatformIO Registry | https://registry.platformio.org/ | embedded libraries/platforms | registry API | High-value addition |

## Forums, Q&A, social, video, and build logs

Community and media sources are candidate evidence for user-reported, measured, build, failure, compatibility, and supplier-experience claims. Treat as lower-confidence than official sources and preserve exact provenance.

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| ROS Discourse | https://discourse.ros.org/ | ROS projects, vendor posts, marketplace, build discussions | Discourse API/RSS | Legacy community/source family |
| Robotics Stack Exchange | https://robotics.stackexchange.com/ | Q&A on components and integrations | Stack Exchange API | High-value Q&A addition |
| Stack Overflow robotics tags | https://stackoverflow.com/questions/tagged/ros | software integration issues | Stack Exchange API | High-value addition |
| Reddit r/robotics | https://www.reddit.com/r/robotics/ | component experience, project discussions | unavailable login-backed agent-reach route, manual until configured | Legacy community source |
| Reddit r/humanoidrobots | https://www.reddit.com/r/humanoidrobots/ | humanoid robot news/discussion | unavailable login-backed route | Legacy community source |
| RobotForum | https://www.robot-forum.com/ | industrial robot forum posts | rendered HTML/manual | Legacy forum source |
| V2EX robotics searches | https://www.v2ex.com/ | Chinese tech community posts | V2EX public API | agent-reach available backend |
| Hackaday.io | https://hackaday.io/projects?tag=robotics | build logs, BOMs, project variants | static/rendered HTML, RSS | Legacy build-log source |
| Hackster.io Robotics | https://www.hackster.io/robotics | tutorials, BOMs, projects | static/rendered HTML | High-value build-log addition |
| Instructables Robotics | https://www.instructables.com/circuits/robots/projects/ | build instructions, parts lists | static/rendered HTML | Legacy build-log source |
| DIY Robocars | https://www.diyrobocars.com/ | autonomous vehicle build logs/community | static/forum/manual | Legacy community source |
| YouTube | https://www.youtube.com/ | reviews, teardowns, tests, build videos | yt-dlp metadata/transcripts where allowed | Legacy video source, agent-reach available |
| Bilibili | https://www.bilibili.com/ | Chinese robotics reviews/build videos | Bilibili search API, manual/video metadata | agent-reach available search backend |
| X/Twitter robotics discussions | https://x.com/ | announcements, discussion threads | unavailable route, manual until configured | Legacy community source |
| Xiaohongshu robotics posts | https://www.xiaohongshu.com/ | Chinese user builds and reviews | unavailable login-backed route | High-value social gap |
| IEEE RAS communities | https://www.ieee-ras.org/ | robotics society news and resources | static HTML/RSS | Legacy community/research source |

## Teardowns, reviews, journalism, and analyst sources

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| IEEE Spectrum Robotics | https://spectrum.ieee.org/robotics | robot profiles, teardowns, specs, articles | RSS/static HTML | Legacy article source |
| The Robot Report | https://www.therobotreport.com/ | robotics news, product releases, market coverage | RSS/static HTML | Legacy article source |
| Wevolver Robotics | https://www.wevolver.com/topic/robotics | engineering articles, teardowns, explainers | static/rendered HTML | Legacy teardown/article source |
| Construction Physics | https://www.construction-physics.com/ | deep technical articles including robot economics/teardowns | RSS/static HTML | Legacy article source |
| iFixit | https://www.ifixit.com/ | repair guides and teardowns where robots/components appear | static HTML/API where approved | Legacy teardown source |
| Bunnie Studios | https://www.bunniestudios.com/ | hardware teardowns and analysis | static HTML/RSS | Legacy teardown source |
| CNET | https://www.cnet.com/tech/ | robot product reviews and coverage | static HTML/RSS | Legacy review source |
| FCC Equipment Authorization | https://www.fcc.gov/oet/ea/fccid | internal photos, manuals for wireless products | official database/manual | Legacy teardown/regulatory source |
| CNX Software | https://www.cnx-software.com/ | embedded boards and module reviews | RSS/static HTML | High-value compute review addition |
| ServeTheHome | https://www.servethehome.com/ | compute/edge hardware reviews | RSS/static HTML | High-value compute review addition |
| Phoronix | https://www.phoronix.com/ | Linux/compute performance relevant to robotics compute | RSS/static HTML | High-value compute benchmark addition |

## Academic, publications, standards, and regulatory

| Candidate | Canonical URL | Coverage | Preferred access interface | Evidence |
|---|---|---|---|---|
| arXiv Robotics | https://arxiv.org/list/cs.RO/recent | papers with component choices, robot specs, experiments | arXiv API/RSS | Legacy paper source |
| IEEE Xplore | https://ieeexplore.ieee.org/ | robotics papers and standards references | metadata/manual, link-only unless licensed | Legacy publication source |
| ACM Digital Library | https://dl.acm.org/ | HRI/robotics publications | metadata/manual, link-only unless licensed | High-value addition |
| ScienceDirect | https://www.sciencedirect.com/ | robotics/control papers | metadata/manual, link-only unless licensed | High-value addition |
| SpringerLink | https://link.springer.com/ | robotics books/proceedings | metadata/manual, link-only unless licensed | High-value addition |
| Google Scholar | https://scholar.google.com/ | citation discovery | manual only | High-value discovery addition |
| Semantic Scholar | https://www.semanticscholar.org/ | paper metadata and citations | official API | High-value publication API |
| Crossref | https://www.crossref.org/documentation/retrieve-metadata/rest-api/ | DOI metadata | official API | High-value metadata API |
| OpenAlex | https://docs.openalex.org/ | open scholarly graph and works metadata | official API | High-value metadata API |
| ISO | https://www.iso.org/ | robotics/safety standards metadata | metadata/manual, link-only | Standards source |
| IEC | https://www.iec.ch/ | electrical/safety standards metadata | metadata/manual, link-only | Standards source |
| NIST | https://www.nist.gov/robotics | robotics benchmarks, publications, test methods | static HTML, files/PDF | High-value standards addition |
| OSHA Robotics | https://www.osha.gov/robotics | safety guidance | static HTML | Regulatory addition |
| CE / EU Machinery Regulation | https://single-market-economy.ec.europa.eu/sectors/mechanical-engineering/machinery_en | regulatory context | static HTML, files/PDF | Regulatory addition |
| UL Standards | https://www.ul.com/services/standards | certification metadata | metadata/manual, link-only | Regulatory addition |

## Archives, preservation, and discovery feeds

| Candidate | Canonical URL | Coverage | Preferred access interface | Notes |
|---|---|---|---|---|
| Internet Archive Wayback Machine | https://web.archive.org/ | historical pages, discontinued datasheets | CDX API, metadata-only/link-only pending policy | Use for provenance and withdrawn pages |
| Common Crawl | https://commoncrawl.org/ | web-scale discovery snapshots | index API, metadata/link discovery | High effort, high policy review |
| GitHub Archive | https://www.gharchive.org/ | GitHub event discovery | public dataset/API | Repository discovery feed |
| GDELT | https://www.gdeltproject.org/ | robotics news discovery | API | Discovery only |
| RSSHub | https://docs.rsshub.app/ | generated RSS for sites lacking feeds | RSS, self-host if approved | Discovery helper, not source approval |
| ROS Discourse RSS | https://discourse.ros.org/latest.rss | ROS discussion discovery | RSS | Community feed |
| Hackaday RSS | https://hackaday.com/blog/feed/ | hardware/robotics discovery | RSS | Build/news feed |
| The Robot Report RSS | https://www.therobotreport.com/feed/ | robotics news discovery | RSS | News feed |
| IEEE Spectrum Robotics RSS | https://spectrum.ieee.org/feeds/topic/robotics.rss | robotics article discovery | RSS | Article feed |
| arXiv cs.RO RSS/API | https://export.arxiv.org/api/query?search_query=cat:cs.RO | robotics paper discovery | API/RSS | Paper feed |
| NIST robotics pages | https://www.nist.gov/robotics | benchmark/standards discovery | static HTML/RSS where available | Standards feed candidate |
| Manufacturer news/blog pages | varies | launches, firmware, revisions, discontinuations | RSS/static HTML | Needs per-source registry rows |

## High-value additions and gaps versus legacy index

- Add explicit official API candidates for DigiKey, Mouser, Octopart, Arrow, Stack Exchange, Crossref, OpenAlex, arXiv, and Semantic Scholar to reduce brittle crawling.
- Add robot-description/model repositories: MuJoCo Menagerie, robot-descriptions, Gazebo Fuel, Google Scanned Objects, YCB Object Set.
- Add modern lidar/depth vendors not prominent in the legacy list: Ouster, Hokuyo, Slamtec.
- Add compute/review sources for embedded boards and edge systems: CNX Software, ServeTheHome, Phoronix.
- Add clearer surplus and used-equipment categories, but keep them manual/link-only until marketplace policy is reviewed.
- Add RSS/discovery feeds as separate discovery sources so downstream approved source identities are not conflated with feed readers.
- Current environment gaps: Exa search unavailable, Reddit/X/Facebook/Instagram/Xiaohongshu/LinkedIn not configured, generic DuckDuckGo challenged, Bing returned empty without API key. Social discovery remains incomplete.

## API and directory evidence links to verify first

| Source | Evidence link | Why it matters | Verification task |
|---|---|---|---|
| DigiKey | https://developer.digikey.com/ | Structured product/price/stock via official API | Confirm auth, terms, quotas, fields, sandbox |
| Mouser | https://api.mouser.com/ | Structured product search and part details | Confirm key requirements, quotas, allowed storage |
| Octopart | https://octopart.com/api | Distributor aggregation | Confirm access tier, cost, reuse restrictions |
| element14/Newark/Farnell | https://partner.element14.com/ | Product APIs | Confirm current API availability and regional coverage |
| Arrow | https://www.arrow.com/api/ | Distributor API | Confirm current developer access and terms |
| GitHub REST | https://docs.github.com/en/rest | Repository metadata and bounded file retrieval | Pin API version and rate/auth behavior |
| GitLab API | https://docs.gitlab.com/api/ | Repository metadata and files | Verify robots/terms and rate limits |
| Stack Exchange API | https://api.stackexchange.com/ | Robotics Q&A metadata/posts | Confirm quota, attribution, filters |
| arXiv API | https://info.arxiv.org/help/api/index.html | Paper discovery and metadata | Confirm API cadence and terms |
| Crossref REST | https://www.crossref.org/documentation/retrieve-metadata/rest-api/ | DOI metadata | Confirm etiquette and email/user-agent requirements |
| OpenAlex API | https://docs.openalex.org/ | Open publication graph | Confirm filters and polite pool use |
| Wayback CDX | https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server | Historical URL discovery | Confirm permitted use and retention model |

## Verification backlog

1. Resolve canonical identity and aliases for every legacy label before adding duplicate source rows.
2. For each candidate, record lifecycle as `discovered` or `researching`, never `approved`, until source onboarding completes.
3. Run robots.txt and terms/reuse review for each target domain and record evidence date.
4. Confirm whether official APIs exist, are current, and have acceptable quotas/costs. Capture docs URL, auth requirements, and rate limits.
5. Decide retention state for each source family: retained bytes, immutable external reference, metadata-only, link-only, manual-only, or denied.
6. Build pilot shortlists that span official manufacturer, distributor/API, repository/BOM, ROS/package source, and volatile offer/stock data.
7. Configure missing agent-reach channels or alternate approved search provider before claiming coverage of Reddit, X, Instagram, Facebook, Xiaohongshu, LinkedIn, or broad web search.
8. Add exact evidence timestamps after each source is actively verified. This file intentionally does not claim current permission or completeness.
9. Cross-link approved candidates into coverage matrices only after identity, policy, and preferred interface are confirmed.
10. Maintain a denied/manual-only list so unsafe or prohibited sources do not silently re-enter discovery.
