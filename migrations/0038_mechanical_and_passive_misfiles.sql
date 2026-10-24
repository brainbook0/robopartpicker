-- 0038: mechanical hardware filed as `electronics`, potentiometers filed as `connector`.
--
-- Same class as 0034-0036, but a noun class those sweeps could not reach: `bearing`, `trimpot` and
-- `potentiometer` were absent from the head-noun vocabulary, so 40 FRC-style bearing blocks, plates,
-- hubs, sprockets and gears stayed in the catch-all `electronics` bucket (23,771 rows) and 9
-- potentiometers stayed in `connector` (1,917 rows) while the other 39 potentiometers are already
-- filed as `resistor`. The potentiometer case is visible on a page Google actually crawls: the
-- most-fetched part URL on 2026-10-23 (10 Googlebot requests) was `Panel Mount 1K potentiometer`,
-- filed as a connector.
--
-- Generated 2026-10-24 by /home/hermes/rpp-scratch/gen-0038.py from a full production dump (34,760
-- live components) and reviewed row by row. Excluded rather than moved: 2 candidates whose name also
-- carries an electrical head word (sensor, LED, PCB, cable, driver, controller, module, relay,
-- encoder, motor...) or a tool word (puller, press, grease, heater); the 121 igus catalogue rows that
-- mention a bearing (a separate ingestion defect: 8,000 rows, names like `automation` and
-- `drylin-linear-guides-overview`, only 82 advertised); and names carrying a query string or a bare
-- `page-N` name, which are scrape artefacts rather than parts (`bearings-shafts-spacers?page=2`).
-- Each statement is guarded on the pre-change category, so a row that has moved since the dump is
-- left alone, and `updated_at` is bumped by the trigger added in 0037 — the statement that changes a
-- canonical URL now changes its freshness signal with it.


-- connector -> resistor (9 rows)
UPDATE components SET category = 'resistor' WHERE category = 'connector' AND id IN ('c-d4ff7bdb00b99af7a7feccfd','c-19f6e0c90c4a166064427b43','c-092c0e440f0ba5f19f35bf29','c-6d5f1038906c7e9218cc4e5a','c-14788d9049862ac6e6cfd266','c-1b466702c011f571d9b948c6','c-b87ae9bf408070b20f5ba2a3','c-6cd3da2965d519b41d275530','c-e20272a0c5b9ca852fb3fe38');

-- electronics -> mechanical (25 rows)
UPDATE components SET category = 'mechanical' WHERE category = 'electronics' AND id IN ('c-9d91baf8de1f418b2922244e','c-c072dc153a9207cb59187451','c-4ad553f25cfab01a209d06e4','c-55e921df6cdbf31017ada507','c-2ce02a37e565adecf05c1129','c-d68e0a0ffa90d936afceb810','c-5993a2ce10c0a782c7ac28de','c-62cf23080ed21adbe9aa5f3b','c-a77eef20663a171a3d01947d','c-301c2c64f995129669f17798','c-6550edfb2384a748d96918c0','c-dacfdd0564c09b7e018972c8','c-f98a4cbd016aa5951f3d74b5','c-cdbab51f6bcb14ded26815d0','c-6e43c35edd1ef0cbf930671d','c-41d273f397eb921eb3af003b','c-610ed1c063c4016e91ab6fc2','c-a7571affcf708133e31c0d2f','c-af55db66261ea20ba9968ca4','c-2f4f6ac59655d4357089c4f0','c-ffbb4df7cb27ab9eb17ee211','c-c204054d8b059f19873d0d4f','c-8dcb7d88cb9738b727481f4e','c-336befac0068168f7725255f','c-97b6199055d309a16f441c7b');

-- electronics -> mechanical (15 rows)
UPDATE components SET category = 'mechanical' WHERE category = 'electronics' AND id IN ('c-d05b0bb8f3ac30411ebd0797','c-a3c8a8eb3dcbe07f98c3bc17','c-7fd92d83725decda1442af5a','c-fffc8fdcb969cfdd83ee81aa','c-5cf9a04f60a79f2593438dc2','c-83867df9af59bc8d0fccc65f','c-5b64b62140dba87a24660f83','c-47b833b2c7bf9e26b0d4ca97','c-8710d9b08f53f96c4a50bd71','c-e07871b09647c60b7caef194','c-a1de53a1d160197f107ba7b4','c-278d02834c7087982cdbe6f8','c-5cecab89ceda1f5e82f8881d','c-6d113a6765e9e897ea2a1342','c-9c14afebe2a65f52f852cb47');

-- Excluded candidates (electrical/tool word in the name), recorded so the next
-- sweep does not have to rediscover them:
--   Soft Potentiometer Kit from Plug&Wear  [connector -> resistor rejected: device word 'kit']
--   Foot Pedal Potentiometer - Sewing Machine Speed Controller  [connector -> resistor rejected: device word 'controller']
