Part 1: New AI Use Case (Manufacturing)

App: FaultTrace, a maintenance knowledge system for plant floor technicians

Company context and current challenges

Cardinal Precision is a 200-person contract manufacturer running CNC machining and assembly across two shifts. Maintenance history lives in a CMMS export of roughly twenty years of work orders, plus paper binders in the shop office. Three of the five senior technicians retire within four years, and their knowledge is not written down. When a machine faults at 2 a.m., the technician on shift either remembers the fix or starts from zero.

The business problem

Repeat faults get diagnosed from scratch. The history that would shorten the repair exists, but nobody can find it. Work orders were typed by different people over two decades, so one failure appears as spindle drift, spndl drift, SPIN-DRFT, and axis wander. Keyword search returns nothing or everything. On a bottleneck cell, an hour of unplanned downtime stops the line, not just the machine.

Target users and their needs

- Technicians on shift need an answer in under two minutes, on a tablet, standing at the machine wearing gloves
- The maintenance planner needs to see which faults keep recurring and which parts to stock
- The plant manager needs downtime by asset and cause, in numbers, for the weekly production meeting

Why AI is the right solution

The blocker is unstructured text with inconsistent vocabulary, which is where keyword search fails and semantic retrieval works. Embedding search finds prior work orders describing the same failure in different words. A language model then summarizes what actually fixed it. Every answer cites the work order numbers behind it, and the app says it found nothing rather than inventing a procedure. Safety documents are linked, never generated. The technician decides. The model retrieves and drafts.

Success metrics

- Median time from fault logged to first corrective action, against existing work order timestamps
- Mean time to repair on repeat faults compared with first occurrences
- Share of closed work orders where the technician marked a suggested prior case as useful
- Retrieval accuracy on 30 held-out fault and fix pairs, scored as correct work order in the top five

MVP features

- Symptom or fault code search returning ranked prior work orders
- Grounded summary of what fixed it before, with linked work order IDs
- Structured close-out form capturing cause, fix, parts used, and minutes down
- Per-asset history page
- Supervisor view ranking recurring faults by total downtime minutes
