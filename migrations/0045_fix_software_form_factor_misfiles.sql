-- 0045: Correct demonstrably-wrong robot form-factor labels on the most-visible project pages,
-- and remove the wrong category from the summary/description text that repeats it.
--
-- Root cause (same class as 0043, and as 0034-0038 for components): `robot_category` is assigned by
-- scripts/backfill-robot-category.mjs (mirror of src/shared/robotCategory.ts) — a first-match keyword
-- regex over name + summary + description + tags. Because the free-text description is scanned, a
-- project whose docs merely MENTION another robot type is filed under it. The result is shown to
-- visitors twice: the "Category:" fact on the project page and the sentence "cataloged as robotics
-- software under the <wrong> category" in the stored summary. Both are wrong for a general software
-- library or engine that has no physical form factor.
--
-- Examples fixed here (all high-star, all verifiably not that form factor from the project's own name,
-- repository and licence — nothing inferred):
--   * mujoco (14,518★, google-deepmind/mujoco)          physics engine, filed `humanoid`
--   * johnny-five (13,411★, rwaldron/johnny-five)        Arduino/JS framework, filed `aerial`
--   * gobot (9,445★, hybridgroup/gobot)                  Go robotics/IoT framework, filed `aerial`
--   * openmvg (6,536★, openmvg/openmvg)                  structure-from-motion library, filed `aerial`
--   * plotjuggler (6,107★, plotjuggler/plotjuggler)      time-series plotter, filed `aerial`
--   * recorder (5,629★, xiangyuecn/recorder)             browser media-recording library, filed `mobile`
--   * neurojs (4,373★, janhuenermann/neurojs)            JS neural-network library, filed `mobile`
--   * mujoco_menagerie (3,803★)                          collection of MuJoCo models, filed `humanoid`
--   * pinocchio (3,646★, stack-of-tasks/pinocchio)       rigid-body dynamics library, filed `humanoid`
--   * libstreaming (3,591★, fyhertz/libstreaming)        RTSP streaming library, filed `mobile`
--   * donkeycar (3,489★, autorope/donkeycar)             self-driving-car framework, filed `actuator`
--   * fast-planner (3,385★, hkust-aerial-robotics/…)     trajectory-planning library, filed `exoskeleton`
--   * brax (3,215★, google/brax)                         differentiable physics engine, filed `quadruped`
--   * rtlamr (2,511★, bemasher/rtlamr)                   RTL-SDR utility-meter decoder, filed `humanoid`
--   * opencog (2,474★, opencog/opencog)                  AGI framework, filed `humanoid`
--   * apriltag (2,455★, aprilrobotics/apriltag)          fiducial-marker detection library, filed `humanoid`
--   * mfem (2,219★, mfem/mfem)                           finite-element library, filed `mobile`
--
-- donkeycar is set to `mobile` (it is genuinely mobile-robot software); every other row is set to
-- `other` because a general library/engine has no single robot form factor. Each statement is guarded
-- on the pre-change robot_category, so a row that has moved since this was written is left alone, and
-- re-running is a no-op.

-- mujoco: humanoid -> other
UPDATE projects SET robot_category = 'other',
  summary = 'MuJoCo is Google DeepMind''s physics engine for robotics, simulation and reinforcement learning. It is software, so no hardware bill of materials applies.',
  description = 'MuJoCo is an open physics engine used to simulate robots and other articulated systems, and is widely used for reinforcement-learning research. It is robotics software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no hardware bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'mujoco' AND robot_category = 'humanoid';

-- johnny-five: aerial -> other
UPDATE projects SET robot_category = 'other',
  summary = 'Johnny-Five is a JavaScript robotics and IoT framework for Arduino and other boards. It is software, so no hardware bill of materials applies.',
  description = 'Johnny-Five is a JavaScript framework for programming microcontrollers and robotics hardware such as Arduino and Raspberry Pi. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no hardware bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'johnny-five' AND robot_category = 'aerial';

-- gobot: aerial -> other
UPDATE projects SET robot_category = 'other',
  summary = 'Gobot is a Go framework for robotics, drones and IoT devices. It is software, so no hardware bill of materials applies.',
  description = 'Gobot is a Go-language framework for programming robots, drones and IoT devices across many platforms. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no hardware bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'gobot' AND robot_category = 'aerial';

-- openmvg: aerial -> other
UPDATE projects SET robot_category = 'other',
  summary = 'openMVG is an open library for 3D computer vision and structure-from-motion. It is software, so no hardware bill of materials applies.',
  description = 'openMVG (open Multiple View Geometry) is a C++ library for 3D reconstruction from images, used in computer-vision and robotics vision pipelines. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no hardware bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'openmvg' AND robot_category = 'aerial';

-- plotjuggler: aerial -> other
UPDATE projects SET robot_category = 'other',
  summary = 'PlotJuggler is a desktop tool for plotting and analyzing time-series data, commonly used with ROS logs. It is software, so no hardware bill of materials applies.',
  description = 'PlotJuggler is a desktop application for plotting and analyzing time-series data, widely used with ROS and robotics logs. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'plotjuggler' AND robot_category = 'aerial';

-- recorder: mobile -> other
UPDATE projects SET robot_category = 'other',
  summary = 'Recorder is a browser JavaScript library for recording audio and video via HTML5 and WebRTC. It is software, so no hardware bill of materials applies.',
  description = 'Recorder is a JavaScript library that records audio and video in the browser using HTML5 and WebRTC APIs. It is general-purpose software, not a robotics design, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'recorder' AND robot_category = 'mobile';

-- neurojs: mobile -> other
UPDATE projects SET robot_category = 'other',
  summary = 'Neurojs is a JavaScript deep-learning and neural-network library. It is software, so no hardware bill of materials applies.',
  description = 'Neurojs is a JavaScript library for building and training neural networks, including in the browser. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'neurojs' AND robot_category = 'mobile';

-- mujoco_menagerie: humanoid -> other
UPDATE projects SET robot_category = 'other',
  summary = 'MuJoCo Menagerie is a curated collection of ready-to-use MuJoCo robot models. It is a model collection, so no single hardware bill of materials applies.',
  description = 'MuJoCo Menagerie collects maintained MuJoCo XML models of robots, including arms, quadrupeds and humanoids, for simulation. It is a model collection rather than one robot, so RoboPartPicker catalogs its public repository and no single hardware bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'mujoco-menagerie' AND robot_category = 'humanoid';

-- pinocchio: humanoid -> other
UPDATE projects SET robot_category = 'other',
  summary = 'Pinocchio is an open-source rigid-body dynamics library for robotics. It is software, so no hardware bill of materials applies.',
  description = 'Pinocchio is a C++ library for rigid-body dynamics and analytical computation, used for simulation and control of robots including humanoids and manipulators. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'pinocchio' AND robot_category = 'humanoid';

-- libstreaming: mobile -> other
UPDATE projects SET robot_category = 'other',
  summary = 'libstreaming is an Android library for RTSP audio and video streaming. It is software, so no hardware bill of materials applies.',
  description = 'libstreaming is an Android library that implements RTSP client and server audio and video streaming. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'libstreaming' AND robot_category = 'mobile';

-- donkeycar: actuator -> mobile (it is genuinely mobile-robot software)
UPDATE projects SET robot_category = 'mobile',
  summary = 'DonkeyCar is an open-source framework for building and training small self-driving cars. It is software for mobile robots, so no hardware bill of materials applies.',
  description = 'DonkeyCar is an open-source Python framework for building and training scale self-driving cars. It is software for mobile robots, not a hardware design, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'donkeycar' AND robot_category = 'actuator';

-- fast-planner: exoskeleton -> other
UPDATE projects SET robot_category = 'other',
  summary = 'Fast-Planner is a trajectory-planning library for quadrotor aerial robots from HKUST-Aerial-Robotics. It is software, so no hardware bill of materials applies.',
  description = 'Fast-Planner is a robust and efficient trajectory-planning library for quadrotor UAVs, from the HKUST Aerial Robotics group. It is planning software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'fast-planner' AND robot_category = 'exoskeleton';

-- brax: quadruped -> other
UPDATE projects SET robot_category = 'other',
  summary = 'Brax is a JAX-based physics engine for differentiable robotics and reinforcement learning. It is software, so no hardware bill of materials applies.',
  description = 'Brax is a GPU-accelerated, differentiable physics engine for robotics and reinforcement-learning research, built on JAX. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'brax' AND robot_category = 'quadruped';

-- rtlamr: humanoid -> other
UPDATE projects SET robot_category = 'other',
  summary = 'rtlamr is an RTL-SDR receiver that decodes utility smart-meter (AMR/ERT) transmissions. It is software.',
  description = 'rtlamr is a receiver that decodes utility smart-meter transmissions using an RTL-SDR dongle. RoboPartPicker catalogs its public repository and indexed files. No bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'rtlamr' AND robot_category = 'humanoid';

-- opencog: humanoid -> other
UPDATE projects SET robot_category = 'other',
  summary = 'OpenCog is an open-source framework for artificial general intelligence (AGI). It is software, so no hardware bill of materials applies.',
  description = 'OpenCog is an open-source project building an Artificial General Intelligence framework and cognitive architecture. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'opencog' AND robot_category = 'humanoid';

-- apriltag: humanoid -> other
UPDATE projects SET robot_category = 'other',
  summary = 'AprilTag is a fiducial-marker detection library used for robot vision and localization. It is software, so no hardware bill of materials applies.',
  description = 'AprilTag is a visual fiducial system: a library that detects 2D tags in camera images, widely used for robot localization, calibration and augmented reality. It is software, not a robot, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'apriltag' AND robot_category = 'humanoid';

-- mfem: mobile -> other
UPDATE projects SET robot_category = 'other',
  summary = 'MFEM is a finite-element method library for scientific computing. It is software, so no hardware bill of materials applies.',
  description = 'MFEM is a lightweight, scalable C++ library for finite-element methods and scientific computing. It is general-purpose numerical software, so RoboPartPicker catalogs its public repository and indexed files and no bill of materials applies.',
  updated_at = '2026-11-12T14:30:00.000Z'
WHERE slug = 'mfem' AND robot_category = 'mobile';
