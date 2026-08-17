# DevCompass

채용 공고에서 요구하는 기술과 실제 기술 생태계 사이의 괴리를 분석하는 서비스.

## 구성

- `app/api`, `app/main.py` — FastAPI 서빙 레이어 (API 서버 VM에 배포)
- `app/batch` — 배치 파이프라인 (배치 서버 VM에 별도 배포)
- `app/db`, `app/core` — API·배치 공통 코드
- `frontend/` — Next.js 프론트엔드
- `requirements/` — 서비스별 의존성 분리 (`base.txt` 공통, `api.txt`, `batch.txt`, `dev.txt`)
- `Dockerfile.api`, `Dockerfile.batch` — 서비스별 이미지
- `deploy/` — 배치 서버 VM 배포용 compose/crontab
- `tests/` — pytest 테스트
- `scripts/` — 운영/초기화 스크립트
- `docs/` — 협업 및 아키텍처 문서

## 배포 구조

API 서버와 배치 서버는 서로 다른 VM에서 독립적으로 뜨고, 같은 DB를 공유한다.

- **API VM**: `Dockerfile.api`로 빌드, 상시 구동 (uvicorn)
- **배치 VM**: `Dockerfile.batch`로 빌드, cron/systemd timer로 주기 실행 (상시 구동 아님)
- 두 VM 모두 `.env`의 `DATABASE_URL`이 실제 DB에 접근 가능한 호스트를 가리켜야 함 (`localhost` 금지)

자세한 배치 서버 배포 절차는 `deploy/docker-compose.batch.yml`, `deploy/crontab.example` 참고.

## 실행법

### 사전 준비

```bash
cp .env.example .env
```

### 개발환경 (Docker, API + DB)

```bash
docker compose up --build
```

### API 서버만 로컬 실행

```bash
pip install -r requirements/api.txt
uvicorn app.main:app --reload
```

### 프론트엔드만 로컬 실행

```bash
cd frontend
npm install
npm run dev
```

### 배치 파이프라인 로컬 실행

```bash
pip install -r requirements/batch.txt
python -m app.batch.run

# 또는 배치 이미지로
docker compose --profile batch run --rm batch
```

### 테스트

```bash
pip install -r requirements.txt
pytest
```

## 배치 팀 가이드: 수집 데이터 DB 저장

배치 파이프라인은 `app/batch/collect/*.py`에서 소스별로 데이터를 수집하고, `app/batch/run.py`가 이를 모아 DB에 저장하는 구조다.

1. **수집 함수 작성**: `app/batch/collect/adzuna.py`, `remoteok.py`처럼 소스별 파일에 `collect() -> list[dict]` 형태로 작성한다. 외부 API 응답을 그대로 반환하지 말고, `models.py`의 컬럼명에 맞춘 dict 리스트로 정리해서 반환한다.

   ```python
   # app/batch/collect/adzuna.py
   def collect() -> list[dict]:
       # 외부 API 호출 후 아래 형태로 정리해서 반환
       return [
           {"title": "...", "company": "...", "source": "adzuna", "url": "...", "raw_text": "..."},
           ...
       ]
   ```

2. **DB 저장은 `app/batch/run.py`에서 처리**: 수집 함수는 순수하게 데이터만 반환하고, DB 세션/커밋은 `run.py`에서 일괄 담당한다. `app/db/database.py`의 `SessionLocal`과 `app/db/models.py`의 모델을 사용한다.

   ```python
   # app/batch/run.py
   from app.db.database import SessionLocal
   from app.db.models import JobPosting
   from app.batch.collect import adzuna, remoteok

   def main():
       db = SessionLocal()
       try:
           postings = adzuna.collect() + remoteok.collect()
           for p in postings:
               db.add(JobPosting(**p))
           db.commit()
       finally:
           db.close()

   if __name__ == "__main__":
       main()
   ```

3. **새 컬럼/테이블이 필요하면** `app/db/models.py`를 수정하고 `python scripts/init_db.py`로 스키마를 반영한다 (별도 마이그레이션 도구는 없음, `create_all` 기반이라 기존 테이블 컬럼 변경은 직접 DB에서 처리하거나 테이블을 새로 만들어야 함).
4. **중복 저장 주의**: 현재 `job_postings.url`에 unique 제약이 없다. 배치를 여러 번 돌려도 중복이 쌓이지 않게 하려면 저장 전에 `db.query(JobPosting).filter_by(url=p["url"]).first()`로 존재 여부를 확인하거나, 모델에 unique 제약을 추가하는 방향을 논의해서 반영한다.
5. 로컬에서 확인은 위 [DB 접속 방법 (DBeaver)](#db-접속-방법-dbeaver) 또는 파이썬 스니펫으로 한다.

## 프론트엔드 ↔ API 계약

프론트(`frontend/lib/api.js`)가 기대하는 응답 형태다. `NEXT_PUBLIC_API_URL`이 비어 있거나 요청이 실패하면 `frontend/lib/mockData.json` / `mockPostings.json`으로 자동 대체되므로, API가 없어도 화면은 그대로 뜬다.

```
GET {NEXT_PUBLIC_API_URL}/api/v1/gapmap?role=
  → { meta: { fromDate, toDate, totalTechs, mappedTechs, totalPostings, mapLimit, roles: [] },
      items: [{
        tech, skillCode, kind, category, aliases: [],
        roles: [],                       // 요구가 많은 직군 최대 2개
        roleBreakdown: [{ role, count, demand, rank, quadrant }],  // 등장한 직군 전부
        demand, demandRank, ecosystemScore, quadrant,
        postings, postingsShare, postingsNote,
        ecosystem: {                      // 각 { score: 0~100, raw: 정수 }
          githubRepo, githubActivity, stackoverflow
        },
        sampleRepositories: [],
        signals: [{ meta, title }]
      }] }
  // summary / verdict / stack은 API가 내려주지 않는다. 프론트가 응답을 받은 뒤
  // frontend/lib/notes.js에서 붙인다 (아래 "해설 문장" 항목 참고).

GET {NEXT_PUBLIC_API_URL}/api/v1/skills
  → { meta: { totalSkills, detailedSkills, taggedSkills, totalPostings, categories: [] },
      items: [{ tech, skillCode, category, aliases: [], postings, postingsShare,
                rank, roles: [], detailed }] }

GET {NEXT_PUBLIC_API_URL}/api/v1/tech/{skillCode}/postings?limit=5
  → { items: [{ company, title, location, employmentType, publishedAt, applyUrl }] }
```

산출 규칙:

- **`ecosystemScore`** = GitHub 저장소 수 · GitHub 이슈/PR 수(180일) · Stack Overflow 질문 수(180일) 세 **원시 카운트를 각각 백분위 순위로 환산한 뒤 단순 평균**, 소수 1자리 반올림.
  CSV에 함께 실려 오는 `github_repo_score` / `github_activity_score` / `ecosystem_heat_score_log`는 **쓰지 않는다.** 셋 다 Min-Max라 200개 중 178개가 10점 미만으로 눌려, 지도 왼쪽 아래에 점이 뭉치고 사분면이 성립하지 않는다.

  > **현재 DW API는 `stackoverflow` 하나만 내려준다.** GitHub 원시 카운트가 아직 DW에 적재되지 않아 `vw_stackoverflow_ecosystem_skill`만 조회하고 있고(`app/api/routes.py`), `ecosystem_score`도 DW가 준 값을 그대로 쓴다. 화면은 **응답에 실제로 들어 있는 지표만 그린다** (`frontend/lib/ecosystem.js`) — 없는 지표를 0점 막대로 그리면 "GitHub 저장소 0개"처럼 사실과 다른 값이 된다. 세 개가 다 들어오는 순간 프론트는 손댈 것 없이 막대 3개로 돌아온다.
  > 적재가 끝나면 백엔드에서 (1) GitHub 뷰를 조인해 원시 카운트를 싣고, (2) `percentile()`을 그 값에 적용하고, (3) `ecosystem_score`를 DW 값 대신 3지표 평균으로 재계산해야 한다.
- **`demand`** = 기술을 요구하는 **공고 건수의 백분위 순위**(대상 집합 안에서 오름차순 순위 ÷ (N−1) × 100). 원시 건수(`postings`)와 전체 대비 비율(`postingsShare`), 순위(`demandRank`)는 별도 필드로 함께 내려준다.
  Min-Max를 쓰지 않는 이유: 공고 건수 분포가 Python 919건 대 Cloudflare 14건으로 극단적으로 치우쳐 있어서, 선형 Min-Max는 Python을 뺀 나머지를 전부 하단에 몰아넣고 log1p Min-Max는 대부분을 50 이상으로 밀어 올려 **`선점 후보` 사분면이 비어 버린다.** 백분위는 중앙값이 정확히 50이라 차트가 그리는 50% 십자선과 일치하고, 네 사분면이 모두 채워진다(200개 기준 65 / 34 / 33 / 68).
  **DW가 내려주는 `demand_score`(`100 * posting_count / MAX(posting_count)`)는 쓰지 않는다.** 같은 선형 최대값 환산이라 Python만 100점이 되고 2위가 61점으로 떨어진다. 프론트는 원시 건수(`posting_count`)를 받아 백분위로 다시 매긴다.
- **`roles`** — 채용공고의 **원본 직군 14종**을 그대로 쓴다. 그 기술의 요구 건수가 많은 직군 상위 2개를 담는다. (이전 버전은 6개 그룹으로 통합했으나, 통합하면 직군 필터가 원본 데이터와 대응하지 않아 폐기했다.)
- **`roleBreakdown`** — 그 기술이 등장한 직군 **전부**와, 각 직군 안에서 다시 매긴 `demand`(백분위) · `rank` · `quadrant`. 직군 필터가 걸리면 프론트는 y축을 여기 실린 값으로 갈아끼운다. `Frontend` 직군에서 React가 몇 위인지는 전체 순위와 다른 질문이고, 직군을 고른 사람이 알고 싶은 쪽은 후자다. 생태계 점수(x축)는 직군과 무관하므로 그대로 두고, 축 하나만 움직이므로 사분면도 함께 다시 계산해 실어 보낸다.
- **`meta.roles`** — 필터 UI에 노출할 직군 목록이자 표시 순서(공고 수 내림차순). 비어 있으면 프론트가 직군 필터를 자동으로 감춘다.
- **`quadrant`** = 두 축을 **50** 기준으로 4분류한 한글 문자열 (`필수` / `선점 후보` / `희소가치` / `저관심`). **서버가 계산해서 내려준다** — 프론트는 색상·라벨에 매핑만 하고 좌표로부터 재계산하지 않는다 (`frontend/lib/quadrants.js`).
- **점수 표기**: `ecosystemScore`와 `ecosystem.*.score`는 모두 **소수 1자리로 반올림**해서 내려준다. 화면이 세 지표와 종합 점수를 같이 보여주므로, 자릿수가 다르면 합이 안 맞는 것처럼 보인다.
- **`ecosystem.*.raw`**는 화면에 항상 함께 표시된다. 세 점수 모두 대상 기술 집합 안에서의 백분위 순위라 최하위가 0점이 되는데, raw가 없으면 "안 쓰인다"로 오독되기 때문이다.
- **`mapLimit`**: 지도에 찍는 점의 개수 (기본 60). **`demand` 상위 N개가 아니라 사분면별로 고르게 뽑는다** — 수요가 백분위라 상위 N개를 뽑으면 y값이 전부 70~100 구간이 되어 판 위쪽 좁은 띠에 점이 겹쳐 쌓인다. 60이면 네 사분면에서 15개씩이고, 어느 사분면이 15개가 안 되면(직군 필터를 걸면 실제로 생긴다) 그 몫은 남은 사분면에 돌아간다. 잘린 기술은 기술 사전으로 넘긴다.
- **표시용 축 스케일**: 지도는 원값을 그대로 좌표로 쓰지 않는다. 두 축 모두 **50을 고정한 채 각 절반 안에서만** 편다 — 50은 사분면 경계선이라, 이렇게 해야 점이 경계를 넘나들며 색과 위치가 어긋나는 일이 없다.
  - **x축(생태계)**은 지금 찍는 점들만 놓고 Min-Max로 다시 편다 (`makeAxisScale`). 실제 값이 두 덩어리로 갈려 원값으로 찍으면 점이 뭉치기 때문이다.
  - **y축(수요)은 값이 아니라 순위로 편다** (`makeRankScale`). `demand`는 공고 건수의 백분위인데 건수가 작은 정수라 동점이 대량으로 생긴다. 실측(164개 기술)으로 서로 다른 `demand` 값은 80개뿐이고, 실제로 찍는 60개 중 28개(47%)가 동점이었다. 동점이면 y가 완전히 같아 이름표가 한 줄에 가로로 겹쳐 못 읽는다. 순위로 펴면 60개가 모두 다른 높이를 받는다. 대가로 공고 건수가 같은 기술이 미세하게 다른 높이로 보이지만, 축에 눈금이 없고 진짜 건수·백분위는 툴팁과 상세 패널이 숫자로 보여준다.

  축 위의 거리가 점수 차이에 비례하지 않으므로 축 눈금에는 "낮음/높음"만 적는다.
- **이름표 충돌 처리** (`fitLabels`): 순위로 펴도 이름표는 여전히 겹친다. 판이 대략 780×520인데 `Triton Inference Server`처럼 150px가 넘는 이름표가 있어 60개를 다 그릴 자리가 없다. 그래서 수요가 높은 것부터 자리를 잡고, 이미 놓인 이름표나 모서리의 구역 이름표와 부딪히면 **그 이름표는 그리지 않는다.** 잘린 이름은 호버 툴팁과 판 아래 칩 목록에서 확인한다. (이전에는 60개를 전부 그려 놓고 서로 겹쳐 20쌍이 못 읽는 상태였다.)
- 공고 목록은 `JOB_POSTING`의 `is_active = true`만, 회사명은 `ATS_BOARD.company_name`에서 조인해 채운다.

> **현재 백엔드와 어긋나는 지점**
> - ~~경로·필드명 불일치~~ **(해소)** `app/api/routes.py`가 `/api/v1` prefix에 `/gapmap`, `/skills`, `/tech/{skill_code}/postings`를 실제 DW 쿼리로 구현했고, 스키마도 `GapItem`으로 계약과 맞춰졌다.
> - **`ecosystem`이 `stackoverflow` 하나뿐이다.** GitHub 지표 2종과 `sampleRepositories`가 빠져 있다 (위 `ecosystemScore` 항목 참고).
> - **기술 수가 164개로 깎인다.** `routes.py`가 `skill["skill_name"] in ecosystem`으로 거르는데, 생태계 데이터가 SO에만 있어 200개 중 164개만 남는다.
> - **`meta.fromDate`가 2013-01-31이다.** 활성 공고의 `min(published_at)`을 그대로 쓰는데, 화면의 "기준 기간"이 13년으로 찍힌다. x축 생태계는 최근 180일이라 **두 축의 시간 범위가 서로 다르다.**
> - `app/db/models.py`는 "임의의 코드임" 주석이 달린 플레이스홀더로, `devcompass-dw-erd.html`의 DW ERD(12테이블)와 무관하다.

### 채용 데이터 파이프라인에서 확인된 한계

`tech_stack_pipeline.ipynb`가 만든 `skills_counts(수정).csv` / `skills_by_job_role(수정).csv`를 화면에 붙이면서 확인한 것들. 지금 수치를 읽을 때 감안해야 한다.

- **회사 자기언급 필터가 벤더 기업의 수요를 지운다.** `tag_dataframe`은 태그가 채용 회사명을 포함하면 자기언급으로 보고 제거하는데, 이 데이터셋에는 Cloudflare·MongoDB·Datadog처럼 자기 제품명이 곧 기술명인 회사가 채용 기업으로 들어 있다. 그 결과 Cloudflare는 200개 중 93위(14건)에 머문다. 실제 수요가 아니라 필터의 부작용이다.
- **~~`GPT / OpenAI` 이름이 양쪽에서 다르다.~~ (해소)** 신규 데이터는 `GPT`(145건) 하나로 통일됐고 `OpenAI`는 별도 canonical에서 빠졌다. 프론트도 합산을 멈추고 `GPT` 단일 항목으로 바꿨다.
- **~~`Claude`가 생태계 수집 대상에 없다.~~ (해소)** 신규 수집이 200개 기술 전부를 덮으면서 `Claude`(172건, 전체 14위)도 지도에 오른다.
- **`share_%`는 직군 간 비교에 쓰면 안 된다.** `Frontend`는 표본이 작아 비율이 쉽게 튄다. 그래서 `roleBreakdown`은 비율이 아니라 **그 직군 안에서의 백분위 순위**를 싣는다 — 직군끼리 비교하는 값이 아니라 한 직군 안에서만 의미가 있는 값이다.
- **0단계 중복 제거 셀이 두 번 돌면 원본 백업을 덮어쓴다.** `dev_role_jobs_raw_backup.csv`에 현재 `dev_role_jobs.csv`를 먼저 복사하는데, 이미 중복 제거된 파일을 다시 돌리면 백업도 중복 제거본으로 바뀌어 원본을 잃는다. 백업이 이미 있으면 건너뛰는 가드가 필요하다.
- **`Node.js`의 alias에 `Node`가 있다.** Kubernetes를 요구하는 공고가 많은데(418건) "Kubernetes node" 같은 표현이 `Node.js`로 잡힐 수 있다. 부록 B 회귀 테스트에 케이스를 추가해 확인해볼 값어치가 있다.
- **DW의 공고 수와 CSV의 태그 수가 다르다.** 데이터팀 Notion 문서의 예시 표는 Python 1121 · AWS 687 · SQL 604인데 CSV는 919 · 428 · 326이고, SQL은 DW 3위 / CSV 6위로 **순위까지 갈린다.** CSV가 중복을 제거한 산출물이라 **CSV를 정본으로 쓴다.** 두 숫자를 한 화면에 섞지 않는다.
- **데이터가 국내 공고가 아니다.** 수집원이 Anthropic·Cloudflare·Palantir 등 영어권 ATS라, 화면 문구에서 "국내 수요"라고 쓰면 틀린 말이 된다. 기존 서술 문구에 있던 국내 언급은 이번에 전부 걷어냈다.

### 다루지 않는 것

- **추세(trend)**: 생태계 CSV가 180일 스냅샷 1회분이라 시계열이 없다. 시계열 적재가 시작되기 전까지 상승/하락 표시는 넣지 않는다.
- **경쟁 강도**: 지원자 수에 해당하는 데이터가 DW에 없다. 근거 없는 수치라 화면에서 제거했다.

## 프론트엔드 화면 구조

데스크톱(`/`, `/dictionary`)과 모바일(`/m`, `/m/dictionary`)은 **컴포넌트 트리와 스타일시트가 완전히 분리돼 있다.** 데스크톱은 `components/` + `app/globals.css`, 모바일은 `components/mobile/` + `app/mobile.css`다. 한쪽을 고쳐도 다른 쪽에 반영되지 않으므로, 화면 작업을 할 때 어느 쪽인지 먼저 확인해야 한다. 공유하는 것은 `lib/` 아래의 데이터 계층뿐이다.

### 기기 분기 (`frontend/proxy.js`)

폰 User-Agent로 `/`, `/dictionary`에 들어오면 각각 `/m`, `/m/dictionary`로 넘긴다. Next.js 16에서 `middleware` 파일 규칙이 `proxy`로 바뀌었다.

- `matcher`에 `/m/*`가 없어 리다이렉트 루프가 생길 수 없다.
- 308이 아니라 **307**을 쓴다. 308은 브라우저가 영구 캐시해서 같은 기기로 나중에 데스크톱 화면을 보려 해도 계속 `/m`으로 끌려간다. 폰 브라우저의 "데스크톱 사이트 요청"이 UA를 바꾸므로 그것이 탈출구가 된다.

### 사분면 가이드 + 지도 (`components/QuadrantMapStage.jsx`)

"사분면 읽는 법"과 괴리맵은 **한 섹션에 겹쳐 있다.** `.quadrants__frame`과 `.gap-map__frame`이 동일한 격자(`30px minmax(0,1fr)`)를 쓰므로, 같은 격자 칸(`grid-area: 1/1`)에 포개면 설명 카드 네 장이 판의 네 구역 위에 그대로 얹힌다. 스크롤이 표적에 닿으면 카드가 제자리에서 흐려지며 판이 드러나고 점이 순서대로 찍힌다. "읽는 법 다시 보기" 버튼으로 되돌아간다.

- 두 레이어는 **항상 마운트 상태**로 둔다. 조건부 렌더링으로 빼면 전환할 때 높이가 튀고 점 버튼이 포커스를 잃는다.
- 전환 상태는 effect로 동기화하지 않고 파생값으로 둔다 — `mapMode = override ?? (triggered || Boolean(selectedTech))`. 스크롤 감지는 `once: true`라 한 번만 발동하고, 그 뒤로는 버튼이 이긴다. 이렇게 하면 스크롤과 버튼이 서로를 되돌리는 일이 구조적으로 생기지 않는다.
- **지도와 상세 패널은 격자째로 한 번에 고정한다** (`.map-section__grid`). 둘을 각각 `position: sticky`로 붙이면 반드시 어긋난다 — sticky는 부모 상자 안에서만 움직이는데 부모도 높이도 달라 붙어 있을 수 있는 거리가 서로 다르기 때문이다(실측 260px 대 0px). 한 상자에 넣으면 어긋날 수가 없다.
- 판 높이는 폭이 아니라 **화면 높이**에서 끌어온다: `--plot-h: clamp(340px, calc(100dvh - 350px), 520px)`. 고정했을 때 한 화면에 들어오게 하기 위해서다. 바닥값 340px는 판이 아니라 **설명 카드**가 정한다 — 카드 4장이 2행으로 들어가려면 그만큼이 필요하다.
- 고정 연출은 `min-width: 1001px and min-height: 700px`에서만 켠다. 그 아래에서는 격자가 1열이 되어 화면보다 커지므로 평범하게 흐르게 둔다.

### 해설 문장 (`frontend/lib/notes.js`, `lib/techNotes.json`)

상세 패널의 문장은 API가 아니라 프론트가 붙인다. `getGapMapData()`가 응답(또는 mockData)을 받은 뒤 `withNotes()`를 거친다.

- **`summary`는 매번 데이터에서 새로 조립한다.** 앞부분은 `techNotes.json`의 손으로 쓴 한 줄 정의("아마존이 제공하는 클라우드 컴퓨팅 플랫폼입니다"), 뒤는 공고 수·비중·직군 통계다. 통계를 손으로 쓰지 않는 이유: 예전에는 통째로 써 놓았는데 문장 안에 "공고 428건(17.7%)" 같은 숫자가 박혀 있어 데이터가 갱신되자마자 실제 값(695건)과 어긋났다.
- **`verdict`("지금 배운다면" 조언)과 `stack`(연관 기술)은 `techNotes.json`에 있는 기술에만 붙는다.** 현재 81개(공고 수 상위 80개 + 기존 27개)에 작성돼 있다. `stack`은 원래 공고 동시등장률로 계산할 값이라 기존 27개 것만 남기고 손으로 추가하지 않았다.

### 기술 사전 (`components/DictionaryClient.jsx`)

- 세로 알파벳 레일은 `position: sticky`로 따라온다. 글자 수가 화면보다 많아지면 아래쪽 글자에 영영 닿을 수 없으므로(sticky라 페이지를 내려도 레일은 제자리) 항목 높이를 줄이고 `max-height` + 스크롤을 함께 건다.
- 글자를 누르면 **부드러운 스크롤을 쓰지 않고 즉시 이동한다.** 부드럽게 굴리면 지나가는 글자마다 스크롤 감지기가 판정을 바꿔 강조가 딸려 다니다가 뒤늦게 도착한다.
- 현재 글자 판정 경계(200px)는 착지 지점에서 나왔다 — `html`의 `scroll-padding-top`(88) + `.dict-group`의 `scroll-margin-top`(108). 경계를 그보다 위에 두면 방금 누른 묶음이 "아직 안 지나간 것"으로 판정돼 강조가 바로 앞 글자로 튄다.

### 전역 제약

- **`html, body`의 `overflow-x`는 반드시 `clip`이어야 한다.** `hidden`으로 두면 body가 스크롤 컨테이너가 되어(한 축이 `hidden`이면 다른 축이 `auto`로 계산된다) 그 안의 `position: sticky`가 전부 죽는다. 실제로 사전 레일과 지도 상세 패널이 sticky로 선언돼 있는데도 따라오지 않던 원인이 이것이었다.
- 스크롤 연출은 전부 `[data-revealed]` + 인라인 `--reveal-delay` 관용구를 쓴다. `transition`은 **기본 선택자에** 선언해야 한다 — `[data-revealed="true"]` 안에만 두면 되돌아갈 때 페이드 없이 즉시 사라진다.
- 외부 의존성은 `next`, `react`, `react-dom` 셋뿐이다. 차트·상태관리·UI 킷 라이브러리를 쓰지 않는 것은 의도된 선택이다.

## 프론트엔드 배포 (Vercel)

`frontend/`는 Next.js 프로젝트로, Vercel에 별도 배포한다 (API/배치 서버 VM과는 독립).

1. **Vercel 프로젝트 생성**
   - [vercel.com](https://vercel.com)에서 GitHub 레포 import
   - **Root Directory를 `frontend`로 지정** (모노레포라서 필수, 안 하면 빌드 실패함)
   - Framework Preset은 Next.js로 자동 인식됨

2. **환경변수 설정**: Vercel 프로젝트 Settings → Environment Variables에서 API 서버 주소를 등록한다 (예: `NEXT_PUBLIC_API_URL=https://<api-vm-host>:8000`). 코드에서는 `process.env.NEXT_PUBLIC_API_URL`로 참조.

3. **CORS 주의**: 현재 `app/main.py`에 CORS 미들웨어가 없다. Vercel 도메인에서 API 서버로 요청하면 브라우저 CORS 에러가 나므로, API 쪽에 `fastapi.middleware.cors.CORSMiddleware`를 추가해서 Vercel 배포 도메인을 `allow_origins`에 등록해야 한다.

4. **배포 방식** — 현재 GitHub 연동으로 동작한다. `main`에 머지하면 프로덕션, 브랜치를 푸시하면 프리뷰가 자동으로 뜬다.

   > **CLI(`vercel --prod`)로 배포하지 말 것.** Root Directory 설정의 의미가 서로 다르다 — Git 배포는 레포 루트를 클론한 뒤 `frontend`로 들어가지만, CLI 배포는 현재 디렉터리 내용을 그대로 올린다. `frontend/` 안에서 CLI 배포를 하면 Vercel이 그 안에서 다시 `frontend`를 찾다가 `The specified Root Directory "frontend" does not exist`로 실패한다. 한쪽 설정으로 양쪽을 만족시킬 수 없다.

5. 로컬에서 프로덕션 빌드를 미리 확인하려면 `cd frontend && npm run build && npm run start`.

6. **다른 기기(폰 등)에서 로컬 dev 서버 접속**: `frontend/next.config.mjs`의 `allowedDevOrigins`에 PC의 LAN IP를 넣어야 한다. 없으면 페이지 골격은 뜨지만 Next.js가 JS 청크와 HMR 요청을 cross-origin으로 차단해 **데이터 로드가 안 된 채 멈춘 것처럼 보인다.** PC IP가 바뀌면 이 목록도 함께 고쳐야 한다.

## 컨테이너 포트

로컬 `docker compose up`(API + DB) 기준.

| 컨테이너 | 포트 | 비고 |
| --- | --- | --- |
| `db` | `5432:5432` | Postgres 16, 데이터는 `db_data` 볼륨에 저장 |
| `api` | `8000:8000` | FastAPI (uvicorn) |
| `batch` | 없음 | 상시 구동 아님, `--profile batch run`으로 1회 실행 |

배치 서버 VM(`deploy/docker-compose.batch.yml`)에는 DB/API 컨테이너가 없고, `.env`의 `DATABASE_URL`로 API 서버 VM의 DB에 원격 접속한다.

## DB 접속 방법 (DBeaver)

사전 준비: `docker compose up`으로 `db` 컨테이너가 떠 있어야 하고, 테이블이 없다면 먼저 `python scripts/init_db.py`로 스키마를 생성한다.

1. DBeaver 실행 → 좌측 상단 **New Database Connection** (플러그 아이콘) 클릭
2. 연결 목록에서 **PostgreSQL** 선택 → Next
3. Main 탭에 접속 정보 입력 (`.env` 값 기준, 기본값은 아래)

   | 항목 | 값 |
   | --- | --- |
   | Host | `localhost` |
   | Port | `5432` |
   | Database | `devcompass` (`.env`의 `POSTGRES_DB`) |
   | Username | `devcompass` (`.env`의 `POSTGRES_USER`) |
   | Password | `devcompass` (`.env`의 `POSTGRES_PASSWORD`) |

4. **Test Connection** 클릭해서 정상 연결 확인 (처음이면 PostgreSQL 드라이버 다운로드 팝업이 뜨는데 그대로 Download 진행)
5. **Finish**로 저장하면 좌측 Database Navigator에 연결이 추가됨
6. 좌측 트리에서 `devcompass` → `Schemas` → `public` → `Tables`로 들어가면 `job_postings`, `technologies`, `gap_results` 테이블 확인 가능
7. 테이블 더블클릭 → **Data** 탭에서 저장된 row를 바로 조회/편집 가능
8. SQL로 직접 조회하려면 테이블 위에서 우클릭 → **SQL Editor** → **Open SQL script**

```sql
SELECT * FROM job_postings;
```

> 배치 서버 VM에서 접속할 때는 Host를 `localhost`가 아니라 API 서버 VM의 실제 접근 가능한 호스트/IP로 넣어야 한다 (`.env`의 `DATABASE_URL`과 동일한 값).

**파이썬 코드에서 조회**

```python
from app.db.database import SessionLocal
from app.db.models import JobPosting

db = SessionLocal()
print(db.query(JobPosting).all())
```

테이블이 아직 없다면 먼저 `python scripts/init_db.py`로 스키마를 생성해야 한다.
