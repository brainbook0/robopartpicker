-- 0046: Correct the robot_category of Mobile ALOHA (markfzp/mobile-aloha, 4,458★) and replace the
-- generated summary/description that repeat the wrong category.
--
-- The import pipeline's first-match keyword classifier filed this project as `gripper` because the
-- README repeats the word "gripper" and never contains the token "manipulator"/"robot arm"; the
-- broader "mobile" rule needs the literal phrase "mobile robot"/"mobile base", which the text lacks.
-- Mobile ALOHA is a bimanual mobile manipulation system (two leader + two follower arms on a wheeled
-- base), so `manipulator` is the accurate form factor and `gripper` is plainly wrong on a 4,458-star
-- page.
--
-- project_kind stays 'robotics_software': the public repository (forked from ALOHA) is the
-- teleoperation and data-collection codebase plus gripper CAD, not a published hardware design. Every
-- fact below is taken from the project's own README and website (retrieved 2026-11-15): four Interbotix
-- arms, an AgileX Tracer mobile base, Dynamixel motors (gripper/wrist motor XM430-W350), three cameras,
-- ROS 1 Noetic; the paper is CoRL 2024. Nothing is inferred; no price or parts list is invented.
--
-- Row-guarded on the pre-change category and idempotent: a database without the imported catalogue is
-- a no-op, and re-running changes nothing.

UPDATE projects SET
  robot_category = 'manipulator',
  summary = 'Mobile ALOHA is a low-cost whole-body teleoperation system for bimanual mobile manipulation from Stanford (CoRL 2024). This page indexes its public repository, which holds the teleoperation and data-collection software plus gripper CAD.',
  description = 'Mobile ALOHA is a bimanual mobile manipulation system: two leader arms and two follower arms on a wheeled mobile base, driven through a whole-body teleoperation interface, and used to collect demonstrations for imitation learning. The public repository (MarkFzp/mobile-aloha, forked from the ALOHA repo) provides the teleoperation and data-collection software and gripper CAD, and documents how to wire and run the hardware: four Interbotix arms, an AgileX Tracer mobile base and three cameras on ROS 1 Noetic. The repository does not publish a priced parts list, so no bill of materials has been resolved for this entry yet.',
  updated_at = '2026-11-15T03:45:00.000Z'
WHERE slug = 'mobile-aloha'
  AND robot_category = 'gripper';