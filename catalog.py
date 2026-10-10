"""Starter environmental data catalog derived from the attached proposal.

The proposal says a separate 119-variable DB exists, but does not enumerate it.
This catalog is intentionally a practical starter set and supports custom items.
"""

GROUPS = [
    {"id": "energy", "name": "에너지", "icon": "⚡", "hint": "전력·연료·스팀 사용 자료", "questions": ["electricity", "fuel", "steam"]},
    {"id": "ghg", "name": "온실가스", "icon": "◒", "hint": "Scope 1·2·3과 감축 활동", "questions": ["fuel", "electricity", "manufacturing"]},
    {"id": "water", "name": "용수", "icon": "◌", "hint": "수도·지하수·재이용수", "questions": ["water"]},
    {"id": "waste", "name": "폐기물", "icon": "▦", "hint": "발생·처리·재활용 내역", "questions": ["waste", "manufacturing"]},
    {"id": "materials", "name": "원부자재", "icon": "◇", "hint": "원재료 투입·구매 자료", "questions": ["manufacturing", "materials"]},
    {"id": "air", "name": "대기오염물질", "icon": "≋", "hint": "배출시설과 측정 기록", "questions": ["air"]},
    {"id": "wastewater", "name": "폐수·수질", "icon": "≈", "hint": "폐수 배출과 수질 측정", "questions": ["wastewater"]},
    {"id": "compliance", "name": "환경법규", "icon": "▤", "hint": "인허가·위반·과태료 기록", "questions": ["permit"]},
]

QUESTIONS = [
    {"id": "manufacturing", "text": "제품을 직접 제조하거나 가공하나요?", "help": "생산 공정에서 원부자재와 폐기물이 발생할 수 있습니다."},
    {"id": "electricity", "text": "사업장에서 전기를 사용하나요?", "help": "전기요금 고지서나 전력 사용 내역을 활용합니다."},
    {"id": "fuel", "text": "도시가스·경유·LPG 등 연료를 사용하나요?", "help": "보일러, 차량, 생산 설비 사용을 포함합니다."},
    {"id": "steam", "text": "외부에서 스팀이나 열을 구매하나요?", "help": "구매 열·스팀 사용 내역을 확인합니다."},
    {"id": "water", "text": "수도나 지하수 등 용수를 사용하나요?", "help": "사업장별 수도 고지서와 계량 기록을 활용합니다."},
    {"id": "waste", "text": "사업장에서 폐기물이 발생하나요?", "help": "일반·지정폐기물과 처리 내역을 포함합니다."},
    {"id": "materials", "text": "원재료나 포장재를 구매·투입하나요?", "help": "생산 및 구매 기록을 활용합니다."},
    {"id": "air", "text": "대기 배출시설이나 대기오염물질 측정 기록이 있나요?", "help": "NOx, SOx, 먼지 등의 측정 자료를 포함합니다."},
    {"id": "wastewater", "text": "폐수가 발생하거나 수질을 측정하나요?", "help": "방류량, BOD, SS, TOC 측정 기록을 포함합니다."},
    {"id": "permit", "text": "환경 인허가나 법규 준수 기록을 관리하나요?", "help": "인허가증, 점검 결과, 위반·과태료 기록을 포함합니다."},
]

# name, standard unit, source example
ROWS = {
    "energy": [
        ("전력 사용량", "kWh", "전기요금 고지서"), ("도시가스 사용량", "Nm³", "도시가스 고지서"),
        ("경유 사용량", "L", "연료 구매·사용대장"), ("LPG 사용량", "kg", "연료 구매·사용대장"),
        ("스팀 사용량", "GJ", "스팀 사용 명세서"), ("재생에너지 사용량", "kWh", "발전·구매 내역"),
        ("총 에너지 사용량", "GJ", "에너지 사용 집계표"),
    ],
    "ghg": [
        ("Scope 1 직접배출량", "tCO₂e", "온실가스 명세서"), ("Scope 2 간접배출량", "tCO₂e", "온실가스 명세서"),
        ("Scope 3 기타간접배출량", "tCO₂e", "공급망 배출량 자료"), ("온실가스 총배출량", "tCO₂e", "온실가스 명세서"),
        ("온실가스 감축 목표", "%", "감축 계획서"),
    ],
    "water": [
        ("총 용수 사용량", "m³", "수도요금 고지서"), ("상수도 취수량", "m³", "수도요금 고지서"),
        ("지하수 취수량", "m³", "지하수 계량 기록"), ("재이용수 사용량", "m³", "용수 관리대장"),
    ],
    "waste": [
        ("총 폐기물 발생량", "t", "폐기물 처리 확인서"), ("일반폐기물 발생량", "t", "폐기물 처리 확인서"),
        ("지정폐기물 발생량", "t", "폐기물 처리 확인서"), ("재활용량", "t", "재활용 처리 명세서"),
        ("소각량", "t", "폐기물 처리 확인서"), ("매립량", "t", "폐기물 처리 확인서"),
        ("재활용률", "%", "폐기물 처리 집계표"),
    ],
    "materials": [
        ("원부자재 투입량", "kg", "생산·투입대장"), ("원부자재 구매량", "kg", "구매 명세서"),
        ("재생 원재료 사용량", "kg", "원재료 명세서"), ("포장재 사용량", "kg", "포장재 구매 내역"),
    ],
    "air": [
        ("NOx 배출량", "kg", "대기 측정 기록"), ("SOx 배출량", "kg", "대기 측정 기록"),
        ("먼지·PM 배출량", "kg", "대기 측정 기록"), ("대기오염물질 총배출량", "kg", "대기 측정 기록"),
    ],
    "wastewater": [
        ("폐수 배출량", "m³", "폐수 계량 기록"), ("BOD 배출량", "kg", "수질 측정 기록"),
        ("SS 배출량", "kg", "수질 측정 기록"), ("TOC 배출량", "kg", "수질 측정 기록"),
    ],
    "compliance": [
        ("환경법규 위반 건수", "건", "환경 점검 기록"), ("환경 과태료·벌금액", "원", "처분 통지서"),
    ],
}

METRICS = [
    {"id": f"{group}-{index}", "group": group, "name": name, "unit": unit, "sourceExample": example}
    for group, rows in ROWS.items() for index, (name, unit, example) in enumerate(rows, 1)
]
