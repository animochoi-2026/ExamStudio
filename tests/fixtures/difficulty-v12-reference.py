TIER_BANDS = {
    "T0": (1.0, 2.0), "T1": (2.1, 3.8), "T2": (3.9, 5.8),
    "T3": (5.9, 7.7), "T4": (7.8, 9.4), "T5": (9.5, 10.0),
}
MOVE_TO_TIER = {"M0": "T0", "M1": "T1", "M2": "T2",
                "M3": "T3", "M4": "T4", "M5": "T5"}
TIER_ORDER = ["T0", "T1", "T2", "T3", "T4", "T5"]


def classify_move(c, r, b, h):
    """C/R/B/H (0~4 정수)에서 Move class 계산."""
    for value, name in [(c, "C"), (r, "R"), (b, "B"), (h, "H")]:
        if type(value) is not int or not 0 <= value <= 4:
            raise ValueError(f"{name}는 0~4 정수여야 함: {value}")
    if c <= 1 and r <= 1 and b <= 1:
        return "M0"
    if r >= 3 and c >= 3 and b >= 2 and h >= 3:
        return "M5"
    a = c + r + b
    if a >= 8:
        return "M4"
    if a >= 6:
        return "M3"
    if a >= 4:
        return "M2"
    return "M1"


def severity(c, r, b):
    return (0.40 * c + 0.35 * r + 0.25 * b) / 4.0


def _calc_s(discovery):
    return severity(discovery["C"], discovery["R"], discovery["B"])


def _severity_units(discovery):
    # 기존 S의 80배. 사슬 동률 비교에서 부동소수점 오차만 피한다.
    return 8 * discovery["C"] + 7 * discovery["R"] + 5 * discovery["B"]


def _successors(id_map):
    """전체 depends_on 그래프. 낮은 클래스·자동적인 발견도 연결에 포함."""
    successors = {did: set() for did in id_map}
    for did, discovery in id_map.items():
        for dep_id in discovery["depends_on"]:
            successors[dep_id].add(did)
    return successors


def _max_chain(target_classes, discoveries, id_map):
    """(해당 클래스의 발견 수, 선택된 사슬 ID 목록)을 반환한다.

    선택 순서: 최장 길이 → 높은 S 평균 → 사슬 ID의 사전순.
    중간의 비대상 발견은 연결에는 사용하고 길이·평균에서는 제외한다.
    예: M4→M0→M4는 길이 2의 M4 사슬이다.
    """
    successors = _successors(id_map)
    memo, visiting = {}, set()

    def chain_key(chain):
        # 길이가 같은 사슬끼리는 S 합과 S 평균의 순서가 같다.
        return (-len(chain),
                -sum(_severity_units(id_map[did]) for did in chain),
                tuple(chain))

    def longest_from(did):
        if did in memo:
            return memo[did]
        if did in visiting:
            raise ValueError("depends_on 그래프에 순환이 있음")
        visiting.add(did)
        best_tail = ()
        for nxt_id in sorted(successors[did]):
            candidate = longest_from(nxt_id)
            if chain_key(candidate) < chain_key(best_tail):
                best_tail = candidate
        discovery = id_map[did]
        is_target = (discovery["_move_class"] in target_classes
                     and discovery["is_non_obvious"])
        chain = ((did,) if is_target else ()) + best_tail
        visiting.remove(did)
        memo[did] = chain
        return chain

    best = ()
    for did in sorted(id_map):
        candidate = longest_from(did)
        if chain_key(candidate) < chain_key(best):
            best = candidate
    return len(best), list(best)


def _assembly_triggered(discoveries, id_map):
    """전체 그래프의 연결을 보존하고 비자동적 M2+ 발견만 센다."""
    parent = {did: did for did in id_map}

    def find(did):
        while parent[did] != did:
            parent[did] = parent[parent[did]]
            did = parent[did]
        return did

    def union(first, second):
        first_root, second_root = find(first), find(second)
        if first_root != second_root:
            parent[first_root] = second_root

    # M0/M1/자동 노드도 연결을 끊지 않는다.
    for discovery in discoveries:
        for dep_id in discovery["depends_on"]:
            union(discovery["id"], dep_id)

    counts = {}
    for discovery in discoveries:
        if (int(discovery["_move_class"][1]) >= 2
                and discovery["is_non_obvious"]):
            root = find(discovery["id"])
            counts[root] = counts.get(root, 0) + 1
    return any(count >= 3 for count in counts.values())


def classify_path(discoveries, literacy_high=False, execution_extreme=False):
    """한 풀이 가지를 분류한다. 원시 입력을 바꾸지 않는다.

    입력은 §14의 유효한 스키마를 전제로 한다. ID는 가지 안에서 고유하며,
    depends_on은 같은 가지에 존재하는 ID를 참조한다.
    성공 정보의 공통 필드: trigger, base_tier, promotions,
    dominant_s, chain_s_avg, chain_ids.
    """
    if not discoveries:
        discoveries = [{"id": "synthetic_m0", "C": 0, "R": 0, "B": 0, "H": 0,
                        "depends_on": [], "is_non_obvious": True}]
    evaluated = [dict(discovery,
                      _move_class=classify_move(discovery["C"], discovery["R"],
                                                discovery["B"], discovery["H"]))
                 for discovery in discoveries]
    id_map = {discovery["id"]: discovery for discovery in evaluated}
    top_discovery = min(evaluated,
                        key=lambda d: (-int(d["_move_class"][1]),
                                       -_calc_s(d), d["id"]))
    base_tier = MOVE_TO_TIER[top_discovery["_move_class"]]
    dominant_s = _calc_s(top_discovery)
    trigger, chain_ids, chain_s_avg = "bottleneck", [], None

    # 기본 티어 우선순위: M5 → M4 사슬 → M3+ 사슬 → 단일 병목.
    if top_discovery["_move_class"] == "M5":
        base_tier, trigger = "T5", "single_wall"
    else:
        m4_len, m4_ids = _max_chain({"M4"}, evaluated, id_map)
        if m4_len >= 2:
            base_tier, trigger, chain_ids = "T5", "dependent_chain", m4_ids
        else:
            m3_len, m3_ids = _max_chain({"M3", "M4", "M5"}, evaluated, id_map)
            if m3_len >= 3:
                base_tier, trigger, chain_ids = "T5", "dependent_chain", m3_ids
        if chain_ids:
            chain_values = [_calc_s(id_map[did]) for did in chain_ids]
            chain_s_avg = sum(chain_values) / len(chain_values)
            dominant_s = max(chain_values)

    # 기본 티어가 T5여도 모든 발동 게이트를 기록한다.
    promotions, increase = [], 0
    if _assembly_triggered(evaluated, id_map):
        promotions.append("assembly")
        increase += 1
    if literacy_high:
        promotions.append("literacy")
        increase += 2
    if execution_extreme:
        promotions.append("execution")
        increase += 1
    tier = TIER_ORDER[min(5, TIER_ORDER.index(base_tier) + increase)]
    if trigger == "bottleneck" and promotions:
        trigger = "promoted"
    return tier, {"trigger": trigger, "base_tier": base_tier,
                  "promotions": promotions, "dominant_s": dominant_s,
                  "chain_s_avg": chain_s_avg, "chain_ids": chain_ids}


def decimal_score(tier, s, e=0, s_avg=None):
    lo, hi = TIER_BANDS[tier]
    if tier == "T0":
        return round(min(2.0, 1.0 + 0.6 * s + 0.1 * e), 1)
    if tier == "T5":
        base = 9.5 + 0.4 * (s_avg if s_avg is not None else s)
        if s_avg is not None:
            base += 0.1
        return round(min(10.0, base), 1)
    return round(min(hi, max(lo, lo + (hi - lo)
                            * (0.85 * s + 0.15 * (e / 4.0)))), 1)


def score_problem(viable_routes, literacy_high=False):
    """완전한 대체 풀이에는 min, 한 풀이의 독립 가지에는 max를 적용한다.

    반환: (problem_tier, score, info).
    경로 없음: (None, None, {"reason": "no_routes"}).
    모든 경로 제외: (None, None, {"reason": "no_eligible_routes"}).
    """
    if not viable_routes:
        return None, None, {"reason": "no_routes"}
    eligible = [route for route in viable_routes
                if not route.get("uses_powerful_tool", False)]
    if not eligible:
        return None, None, {"reason": "no_eligible_routes"}

    best, best_key = None, None
    for route in eligible:
        route_exec = route.get("execution_extreme", False)
        branches = route.get("independent_branches", [])
        parts = branches if branches else [route]
        results = []
        for part in parts:
            tier, info = classify_path(part.get("critical_discoveries", []),
                                       literacy_high, route_exec)
            e = part.get("execution_load", route.get("execution_load", 0))
            score = decimal_score(tier, info["dominant_s"], e,
                                  info["chain_s_avg"])
            results.append((tier, score, info))
        tier, score, info = max(results,
                                key=lambda item: (TIER_ORDER.index(item[0]),
                                                  item[1]))
        route_id = route["route_id"]
        candidate_key = (TIER_ORDER.index(tier), score, route_id)
        if best is None or candidate_key < best_key:
            best = (tier, score, info, route_id)
            best_key = candidate_key
    info_out = dict(best[2], selected_route_id=best[3])
    return best[0], best[1], info_out