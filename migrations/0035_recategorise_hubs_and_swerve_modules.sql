-- Second pass of the same curation: hub, swerve-module, spacer and shaft-collar names
-- the first keyword sweep did not match (its terms were motor/servo/wheel/gear/...).
-- Same classifier, same conservative rule: only unambiguous head nouns move; hub names
-- that are electronics (power distribution hub, USB hub, pneumatic hub) stay put.
-- 1310/1313 Hyper Hubs, 1309/1311/1312 Sonic Hubs, SDS MK4* Swerve Modules, MAXSwerve
-- and EasySwerve modules, 1502 ID spacers and MAXSpline shaft collars are mechanical
-- parts the DigiKey-era importer filed as ic/connector. 36 rows.

UPDATE components SET category = 'mechanical', updated_at = '2026-10-22T05:10:00.000Z'
  WHERE category = 'connector' AND id IN ('c-10a510545a0eac0d86e55c60', 'c-16de4865dd8e4020e6618a9a', 'c-3f06f00ccd62562cc4dea419', 'c-4b02bf1662ba46fc31d45cfc', 'c-768652adb2a97d9322ece768', 'c-7c85283dd392a6ecb3bdb883', 'c-868d5441d5b08e23181c4135', 'c-910dc0d292fcf77949d8d25d', 'c-9cc0503fbef4adcca1450378', 'c-b2dcc542f57c9225997ae6bd', 'c-baf7f81dd34458a8d35b6ee3', 'c-d8c5afb698dad57d339194df', 'c-e0fd278a3991eab1c40b5394', 'c-ec437783fd693a84ca520fe4', 'c-ed007fbe8df2869e4bbd701b');
UPDATE components SET category = 'led', updated_at = '2026-10-22T05:10:00.000Z'
  WHERE category = 'diode' AND id IN ('c-64c300e6647fac65e1580077');
UPDATE components SET category = 'mechanical', updated_at = '2026-10-22T05:10:00.000Z'
  WHERE category = 'ic' AND id IN ('c-0e5b13ababbc211b700f2b8c', 'c-12ecfb60ce0b34c5312f60cc', 'c-1602642eee826b4a8b9ef77c', 'c-445cee16531224a63d6bec49', 'c-4ea7f1bc10702edb9379f11f', 'c-5ca07502d92ac2f19a1663c9', 'c-607389aff74d16710212d51b', 'c-6684972f6594328d09de2876', 'c-67f10624c923150a1b6420c7', 'c-8291703d22845f11a51c2a99', 'c-a45394827639d6aff17c328b', 'c-a8b0d98b6ec0f1b5f224a1b0', 'c-bc37e0466bbfc246c0af75bc', 'c-beef04348597dc1b50cd6902', 'c-c0b43e5651c75e2f678ceb65', 'c-c10de732ae308e70a8f7a937', 'c-c19fac6e8ffdb7b5bdcfa464', 'c-f8113b33b6caeea87be71dfc');
UPDATE components SET category = 'sensor', updated_at = '2026-10-22T05:10:00.000Z'
  WHERE category = 'ic' AND id IN ('c-0d822e04be95d11b1da91f05', 'c-f4fee6c1cbf14611a18bacc8');
