"""Seed synthetic Cardinal Precision CMMS history (messy vocabulary on purpose)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.db import Base, SessionLocal, engine
from app.models import Asset, Employee, WorkOrder
from app.retrieval import embed_text, embedding_to_json
from app.security import hash_password

DAY_OFFSETS = [0, 1, 1, 2, 3, 5, 7, 9, 12, 14, 18, 21, 25, 30, 35, 40, 45, 55, 70, 90]

ASSETS = [
    ("CNC-12", "Haas VF-2 Cell 12", "Machining"),
    ("CNC-07", "Okuma LB3000 Cell 7", "Machining"),
    ("ASM-03", "Assembly Station 3", "Assembly"),
    ("CONV-01", "Infeed Conveyor 1", "Material"),
]

# email, name, role, floor, function, rank, shift
EMPLOYEES = [
    ("tech@cardinal.local", "Jordan Lee", "technician", "Floor 2 / Cell 12", "CNC maintenance", "Tech II", "Night"),
    ("tech2@cardinal.local", "Sam Ortiz", "technician", "Floor 1 / Cell 7", "CNC maintenance", "Tech I", "Day"),
    ("planner@cardinal.local", "Avery Kim", "planner", "Maintenance office", "Maintenance planning", "Supervisor", "Day"),
    ("admin@cardinal.local", "Morgan Blake", "admin", "Plant offices", "Plant systems admin", "Admin", "Day"),
]

# Deliberately inconsistent wording across years
WORK_ORDERS = [
    ("WO-00001", "CNC-12", "SPIN-DRFT", "spndl drift on X after warm-up", "loose coupling", "tightened coupling bolts, re-indicated", "M8 bolts", 95),
    ("WO-00002", "CNC-12", "AXIS", "axis wander during finish pass", "worn way wipers letting chips in", "replaced wipers, cleaned ways", "way wiper kit", 140),
    ("WO-00003", "CNC-12", "ALM-41", "spindle vibration alarm after tool change", "unbalanced toolholder", "swapped holder, balanced tool", "CAT40 holder", 45),
    ("WO-00004", "CNC-07", "OVERHEAT", "spindle getting hot / overheating at 8k rpm", "clogged oil cooler fins", "cleaned cooler, verified flow", "filter element", 120),
    ("WO-00005", "CNC-07", "HOT", "spindle running hot, smell of oil", "low oil level", "topped oil to sight glass, checked leak", "ISO VG32 oil", 35),
    ("WO-00006", "CNC-07", "VIB", "vib on Z rapid", "loose ballscrew locknut", "retorqued locknut to spec", None, 80),
    ("WO-00007", "ASM-03", "ESTOP", "e-stop loop open randomly", "cracked cable at strain relief", "replaced pendant cable", "pendant cable", 60),
    ("WO-00008", "ASM-03", "FAULT", "station fault after weekend shutdown", "air regulator set too low", "reset regulator to 90 psi", None, 25),
    ("WO-00009", "CONV-01", "JAM", "conveyor jam / motor overload", "seized bearing on idler", "replaced idler bearing", "6204-2RS", 110),
    ("WO-00010", "CONV-01", "OVERLOAD", "drive trips on start", "belt too tight", "adjusted belt tension per OEM", "V-belt A36", 40),
    ("WO-00011", "CNC-12", "SPNDL", "spindle drift noticed by QC on bore", "encoder coupling slip", "replaced flexible coupling", "encoder coupling", 155),
    ("WO-00012", "CNC-12", "DRFT", "X axis drift overnight", "servo tuning drift after power event", "reloaded servo params from backup", None, 70),
]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Asset).count() == 0:
            for code, name, area in ASSETS:
                db.add(Asset(code=code, name=name, area=area))
            db.commit()

        if db.query(Employee).count() == 0:
            for email, name, role, floor, function, rank, shift in EMPLOYEES:
                db.add(
                    Employee(
                        email=email,
                        full_name=name,
                        role=role,
                        floor_level=floor,
                        function_title=function,
                        rank_level=rank,
                        shift=shift,
                        password=hash_password("ADMIN"),
                        active=True,
                    )
                )
            db.commit()
            print(f"Seeded {len(EMPLOYEES)} employees.")
        else:
            print("Employees already present; skip employee seed.")

        if db.query(WorkOrder).count() == 0:
            assets = {a.code: a for a in db.query(Asset).all()}
            now = datetime.now(timezone.utc)
            for i, (ext, asset_code, fault, symptom, cause, fix, parts, mins) in enumerate(
                WORK_ORDERS
            ):
                parts = parts or ""
                blob = " ".join([fault, symptom, cause, fix, parts])
                offset = DAY_OFFSETS[i % len(DAY_OFFSETS)]
                db.add(
                    WorkOrder(
                        external_id=ext,
                        asset_id=assets[asset_code].id,
                        fault_code=fault,
                        symptom=symptom,
                        cause=cause,
                        fix=fix,
                        parts_used=parts,
                        minutes_down=mins,
                        embedding_json=embedding_to_json(embed_text(blob)),
                        created_at=now - timedelta(days=offset, hours=(i % 8) + 1),
                    )
                )
            db.commit()
            print(f"Seeded {len(WORK_ORDERS)} work orders across {len(ASSETS)} assets.")
        else:
            print("Database already has work orders; skip seed.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
