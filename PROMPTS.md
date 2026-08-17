# Project prompts

A running log of the longer, substantive product directives given during the
catalog-expansion phase of RoboPartPicker. They are recorded here as the
product's working requirements, in the order they were given.

> Note: the session was compacted several times for context-length reasons.
> Directives marked with a caret (^) are verbatim from the retained transcript;
> earlier directives that predate the retained transcript are summarized from
> the work they produced.

## Catalog expansion phase

### 1. Expand the physical design catalog and categorize it

> ^ "find more physical projects I feel like 55 is wayy too little, probably
> like 0.1% of the total number of physical designs out there that are open
> source, also catorize them and expand the search filters things like
> humanoids, etc"

Outcome: harvested thousands of open-source robot repos from GitHub, added a
`robot_category` taxonomy (humanoid, manipulator, gripper, quadruped, hexapod,
mobile, aerial, biped, exoskeleton, head, actuator, underwater, other), and
added category filters to the discover page.

### 2. Show closed-source humanoids on the homepage

> ^ "also there are no closed source humanoid robots being displayed on the
> homepage" (…like Optimus and stuff)

Outcome: added a "Commercial humanoid robots" section to the homepage
(Tesla Optimus, Atlas, Digit, Figure, NEO, G1, GR-2, Phoenix, Walker S1, Apollo).

### 3. Fill empty project detail pages

> ^ "all of these fields are empty? Reproductions 0 started · 0 verified, Est.
> cost —, Est. time —, Parts —, Assembly —, Software —, Integrations —,
> Evidence —, Description: no long-form description provided, Bill of
> materials: no BOM items recorded…"

Outcome: built enrichment scripts to backfill descriptions, cover images,
hardware/software/build fields, evidence, assembly steps, and BOMs.

### 4. Generate BOMs from files and fix the 3D preview

> ^ "build a script that makes the bom by looking at the project files if they
> don't have a bom, also make sure that the 3d preview is accurate"

Outcome: added BOM extraction from BOM CSVs, README markdown tables and parts
lists, and URDF links; made the 3D preview prefer assembly/largest models.

### 5. Fully fill every project page

> ^ "I expect every project to have the fields fully filled"

Outcome: a completeness pass that fills hardware (DoF, compute), software
(ROS, middleware, languages), build (difficulty, time, cost, tools, skills,
fabrication), assembly, and reproducibility for every physical design, with
inferred values recorded as `inference` evidence.

### 6. Derive parts with a cheap model, create releases, sync BOMs

> ^ "you can derive the parts from the repos though right? maybe use a cheaper
> model for that, and yes create a portable RPPS release for every project and
> yes do the other thing as well, if there is something that is good to do it
> do it and don't ask for my approval"

Outcome: AI-derived BOMs via a cheap OpenRouter model, portable RPPS releases
for every project, and a sync from RPPS BOMs into the structured
`boms`/`bom_versions`/`bom_items` tables.

### 7. The model files are the ground truth for BOMs

> ^ "the repos all have model files thats 100% guaranteed so the information
> for the boms is there"

Outcome: derived fabricated parts directly from STL/STEP/OBJ/FreeCAD/Fusion/
SolidWorks/Blender model filenames and URDF links, achieving 100% physical BOM
coverage; reclassified repos with no model files as robotics_software.

### 8. No unfilled project pages

> ^ "I will not accept unfilled project pages thats the end"

Outcome: enforced the invariant that every `physical_design` project has a BOM,
description, hardware/software/build fields, assembly, evidence, cover, files,
and a release.

### 9. Expand the catalog and build a massive supplier catalogue

> ^ "also expand the catalogue even more, we also want humanoid robot parts,
> find all of the suppliers, remember if you can't scrape a site try and find
> another site, just keep on moving until you find the data that is scrapable,
> eventually we will build a massive supplier catalogue"

Outcome: added humanoid/parts/actuator GitHub search queries, and built
resilient supplier scrapers that move to the next site when one is not
scrapable (DFRobot, Waveshare, Pololu, ROBOTIS Dynamixel, Hiwonder, Feetech).

### 10. Continue autonomously: HUMANO + suppliers + DigiKey cleanup

> ^ "Continue autonomously. Next: find the HUMANO robot and add it to the
> catalog with BOM/files/cover like the rest, then keep expanding suppliers
> (Pololu, ROBOTIS/Dynamixel, Hiwonder, Feetech - resolve their correct listing
> URLs if you get 404/302) and clean up the ~32k miscategorized DigiKey
> components. All internal catalog work, no publishing, no public posts. Post a
> milestone update when each of those lands; continue until all are done."

Outcome: added the Igus Humanoid Open Platform ("Humano"), scraped Pololu,
ROBOTIS Dynamixel, Hiwonder (Shopify `products.json`), and Feetech, and
re-categorized 32,590 DigiKey components.

### 11. Position as the information layer and largest marketplace

> ^ "on the github readme add a section about also wanting to be the
> information layer and largest marketplace for robotics components, and
> therefore need to have the most extensive data collection. Also add an md
> files with all of the previous long prompts that I have given as part of this
> project"

Outcome: added the "Vision: the information layer for robotics" section to the
README, and this prompt log.
