# 제자반 신앙생활 프로젝트 스펙 정의서

## 1. 문서 목적

이 문서는 현재 `jejaban.netlify.app` 프로젝트의 실제 구현 상태를 기준으로,
기능 범위, 데이터 구조, 저장 방식, 페이지 역할을 빠르게 파악할 수 있도록 정리한 문서이다.

이 문서의 목적은 다음과 같다.

- 현재 프로젝트를 유지보수하거나 확장할 때 기준 문서로 사용한다.
- 코드 전체를 다시 읽지 않아도 페이지별 책임과 데이터 포맷을 이해할 수 있게 한다.
- 향후 동일한 구조의 신앙생활 웹앱을 재구축할 때 재사용 가능한 설계 기준으로 활용한다.

본 문서는 현재 워크스페이스의 실제 파일 상태를 반영하며, 구현 완료 상태와 현재 한계도 함께 명시한다.

---

## 2. 프로젝트 개요

### 2.1 서비스 정체성

- 서비스명: `제자반 신앙생활`
- 형태: 모바일 중심 정적 웹앱 + PWA
- 핵심 기능:
  - `42주 성경 1독`
  - `32주 암송`
  - `중보기도`
- 주요 사용자:
  - 제자반 참여자
  - 교회 성도
  - 개인 신앙 루틴 관리 사용자

### 2.2 운영 특성

- 로그인 없음
- 서버 API 없음
- 사용자 상태는 브라우저 저장소 사용
- Netlify 같은 정적 호스팅 환경에 바로 배포 가능
- 일부 기능은 오프라인 캐시 지원

### 2.3 현재 구현 상태 요약

- 홈 대시보드 구현 완료
- `32주 암송` 구현 완료
- `중보기도` 구현 완료
- `42주 성경 1독` 구현 완료
- 성경 본문 열람 및 GOODTV 오디오 기능 유지
- 다만 `42주 읽기표` 데이터는 현재 첨부 JPG를 완전 수동 전사한 값이 아니라,
  기존 통독 데이터를 `42주 x 7일` 형식으로 변환한 버전이다

즉, 현재 사이트는 서비스 가능한 상태이나
`bible-read/data.json`은 실제 제자반 표와 대조 검증이 추가로 필요하다.

---

## 3. 기술 스택

### 3.1 프론트엔드

- HTML5
- Vanilla JavaScript
- jQuery 3.7.1 CDN
- Tailwind CSS CDN

### 3.2 브라우저 기능

- `localStorage`
- `crypto.subtle.digest` 기반 SHA-256 해시
- `speechSynthesis` 기반 TTS
- Wake Lock API
- Web Share API
- Service Worker
- PWA Manifest
- IndexedDB 레거시 마이그레이션 대응

### 3.3 외부 의존성

- Tailwind CDN
- jQuery CDN
- GOODTV 성경 음원 URL
- `canvas-confetti` 브라우저 번들

---

## 4. 디렉터리 구조

```text
/
├─ index.html
├─ PROJECT_SPEC.md
├─ README.md
├─ manifest.webmanifest
├─ sw.js
├─ Web.config
├─ js/
│  ├─ site.js
│  ├─ confetti.browser.min.js
│  └─ readme.txt
├─ assets/
│  └─ js/
│     └─ utils.wakelock.js
├─ memorize/
│  ├─ index.html
│  ├─ app.js
│  └─ data.json
├─ bible-read/
│  ├─ index.html
│  ├─ app.js
│  └─ data.json
├─ prayer/
│  ├─ index.html
│  └─ app.js
├─ data/
│  ├─ bible_db.json
│  ├─ bible_read_plan_template.xlsx
│  └─ memorize_weeks_2026.xlsx
├─ icons/
├─ images/
└─ tools/
   ├─ transform-bible-read.js
   ├─ ocr-image.ps1
   ├─ list-astask.ps1
   ├─ OcrImage.cs
   └─ OcrImage.csproj
```

### 4.1 `tools/` 디렉터리 성격

- 서비스 런타임에 직접 포함되는 기능은 아님
- 데이터 변환 및 OCR 시도용 보조 스크립트
- 현재 실사용 핵심은 `transform-bible-read.js`

---

## 5. 페이지 구성

### 5.1 홈 `/`

역할:

- 전체 서비스 진입점
- 3개 기능으로 이동하는 대시보드
- 각 기능의 현재 진행률 표시
- 설치 유도 / 공유 / 보기 설정 제공

주요 기능:

- 연도 표시
- `42주 성경 1독` 진행률 표시
- `32주 암송` 진행률 표시
- 저장된 기도문 개수 표시
- 공유 버튼
- 설정 드로어
  - 다크모드
  - 글자 크기
- PWA 설치 팝업

데이터 소스:

- `/memorize/data.json`
- `/bible-read/data.json`
- `localStorage`

특징:

- 읽기표 데이터가 배열인지, `{ weeks: [...] }` 구조인지 둘 다 대응하도록 구현됨

### 5.2 `32주 암송` `/memorize/`

역할:

- 주차별 암송 본문 표시
- 완료 체크
- 주당 2구절 TTS 반복 재생

주요 기능:

- 현재 연도 기준 첫 월요일 기반 주차 계산
- `?week=` 쿼리 지원
- 이전 / 현재 / 다음 주 이동
- 완료 체크 및 해제
- 자동 다음 미완료 주 이동 옵션
- TTS
  - 2개 구절 연속 읽기
  - 텀 설정
  - 속도 설정
  - 한국어 음성 선택
- 진도 초기화

데이터 소스:

- `/memorize/data.json`
- `localStorage`

### 5.3 `42주 성경 1독` `/bible-read/`

역할:

- 42주 x 7일 읽기표 제공
- 읽은 분량 체크
- 성경 본문 보기
- GOODTV 오디오 재생

주요 기능:

- `?day=` 쿼리 지원
- 이전 / 미완료 / 다음 이동
- 완료 체크 및 해제
- 자동 다음 미완료 이동 옵션
- 회차(`n독`) 지원
- 구절 클릭 시 본문 모달 표시
- GOODTV 장별 음원 재생
- 선택한 분량 전체 이어듣기
- 화면 꺼짐 방지 옵션
- 진도 초기화

데이터 소스:

- `/bible-read/data.json`
- `/data/bible_db.json`
- GOODTV MP3 URL
- `localStorage`

특징:

- 앱 내부 처리 단위는 `selectedDay`이지만
  화면 라벨은 `n주 n일` 형식으로 노출됨
- 현재 데이터 포맷은 다음 구조를 사용한다:

```json
{
  "planName": "42주 성경 1독",
  "totalWeeks": 42,
  "daysPerWeek": 7,
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": 1,
          "entry": 1,
          "readings": ["창1", "마1", "스1", "행1"]
        }
      ]
    }
  ]
}
```

### 5.4 `중보기도` `/prayer/`

역할:

- 기도문 작성 / 수정 / 삭제 / 정렬 / 잠금 관리

주요 기능:

- 기도문 목록 렌더링
- 작성 / 수정 / 삭제
- 위 / 아래 이동
- 공개 / 잠금 상태 저장
- 잠금 기도문 비밀번호 확인 후 열람
- 전체 펼치기 / 접기
- 레거시 IndexedDB 데이터 이전

데이터 소스:

- `localStorage`
- 필요 시 IndexedDB 레거시 데이터

---

## 6. 데이터 구조

### 6.1 암송 데이터 `memorize/data.json`

현재 구조:

```json
{
  "weeks": [
    {
      "week": 1,
      "category": "제자훈련의 터다지기",
      "title": "나의 신앙고백과 간증",
      "ref1": "롬 10:9-10",
      "text1": "...",
      "ref2": "마 16:16",
      "text2": "...",
      "verses": [
        { "label": "A", "ref": "롬 10:9-10", "text": "..." },
        { "label": "B", "ref": "마 16:16", "text": "..." }
      ]
    }
  ]
}
```

실제 앱 사용 필드:

- `week`
- `category`
- `title`
- `verses[]`
  - `label`
  - `ref`
  - `text`

하위 호환 처리:

- `verses`가 없으면 `ref1/text1`, `ref2/text2`를 조합해 렌더링함

### 6.2 읽기표 데이터 `bible-read/data.json`

현재 구조:

```json
{
  "planName": "42주 성경 1독",
  "totalWeeks": 42,
  "daysPerWeek": 7,
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": 1,
          "entry": 1,
          "readings": ["창1", "마1", "스1", "행1"]
        }
      ]
    }
  ]
}
```

앱 내부 정규화 후 사용 필드:

- `day`
  - 전체 순번
- `week`
- `dayInWeek`
- `entry`
- `readings`
- `label`
  - 예: `1주 1일`

주의:

- 현재 `date`, `month`, `dayOfMonth` 중심 구조가 아니라
  `42주` 구조를 우선 사용함
- 일부 로직은 과거 365일 구조와 호환되도록 작성되어 있음

### 6.3 성경 본문 DB `data/bible_db.json`

역할:

- 책 약어 -> 책 번호
- 책 번호 -> 책 이름
- 책/장 -> 절 목록

사용 목적:

- 구절 파싱
- 본문 모달 렌더링
- GOODTV 오디오 URL 생성

### 6.4 기도문 저장 구조

```json
[
  {
    "id": "prayer-1710000000000",
    "title": "가정을 위한 기도",
    "content": "....",
    "isPrivate": true,
    "passwordHash": "sha256...",
    "order": 0,
    "createdAt": "2026-03-26T00:00:00.000Z",
    "updatedAt": "2026-03-26T00:00:00.000Z"
  }
]
```

---

## 7. 브라우저 저장소 규격

### 7.1 전역

- `theme`
  - `light | dark`
- `textSize`
  - `sm | base | lg`
- `installHelpSeen:v1`
  - 설치 안내 노출 여부

### 7.2 암송

- `memorized:{year}`
  - 예: `memorized:2026`
  - 값: `{ "1": true, "2": false }`
- `memorize:options:v1`
  - 자동 다음 주 이동 옵션
- `memorize:tts:v4`
  - TTS UI 상태 / 텀 / 속도 / 음성

### 7.3 읽기

- `bibleRead:progress:v2`
  - 회차별 완료 맵
- `bibleRead:options:v1`
  - 자동 이동 / Wake Lock 옵션
- `bibleRead:audio:v1`
  - 오디오 패널 열림 여부

### 7.4 기도

- `nalmada-prayers:v1`
  - 전체 기도문 배열
- `nalmada-prayers:migrated:v1`
  - 레거시 마이그레이션 완료 여부

### 7.5 레거시 IndexedDB

- DB 이름: `nalmada-prayer-db`
- Store 이름: `prayers`

주의:

- 기도 저장 키 이름은 여전히 `nalmada-*`를 유지한다
- 즉, 브랜딩은 바뀌었지만 저장 키는 호환성 때문에 기존 이름을 계속 사용 중이다

---

## 8. 공통 자바스크립트 모듈

### 8.1 `js/site.js`

제공 기능:

- 텍스트 선택 / 우클릭 제한
- 전역 글자 크기 제어
- 전역 테마 제어
- 오버레이 스택 관리
- confetti 래퍼

노출 객체:

- `window.SiteTheme`
- `window.SiteTextSize`
- `window.SiteOverlay`
- `window.SiteFX`

### 8.2 `assets/js/utils.wakelock.js`

제공 기능:

- Wake Lock API 사용 가능 여부 판단
- 화면 꺼짐 방지 on/off

노출 객체:

- `window.SiteWakeLock`

---

## 9. 기능 상세 규칙

### 9.1 암송 주차 계산

- 기준연도: 현재 연도
- 시작일: 해당 연도 1월 1일 이후 첫 월요일
- 현재 날짜와의 차이를 주 단위로 계산
- 범위는 `1 ~ totalWeeks`

### 9.2 암송 완료 처리

- 주차 단위 boolean 토글
- 완료 시 confetti
- 옵션이 켜져 있으면 다음 미완료 주로 이동

### 9.3 암송 TTS

- `speechSynthesis` 사용
- 한 주의 2개 구절을 이어서 읽음
- 읽기 종료 후 지정 텀 뒤 재반복
- 속도 프리셋 지원

### 9.4 읽기표 선택 규칙

- `?day=`가 있으면 우선 사용
- 없으면 가장 가까운 미완료 분량을 기본 선택
- 자동 이동 옵션이 켜지면 완료 후 다음 미완료로 이동

### 9.5 읽기 회차 구조

```json
{
  "activeCycle": 1,
  "cycles": {
    "1": {
      "completed": { "1": true, "2": true },
      "startedAt": "...",
      "finishedAt": "..."
    }
  }
}
```

규칙:

- 현재 회차 전체 완료 시 `finishedAt` 기록
- 다음 회차 자동 생성
- 이후 새 회차 기준으로 다시 진행

### 9.6 본문 열람

흐름:

1. 읽기표 구절 클릭
2. 토큰 파싱
3. `bible_db.json` 조회
4. 모달 렌더링

지원 범위:

- 단일 장
- 장 범위
- 절 범위
- 일부 복합 표기

### 9.7 GOODTV 오디오

URL 규칙:

- `https://online.goodtv.co.kr/online_bible/goodtvbible/Revision/{bookNum}/{chapter}.mp3`

지원 기능:

- 현재 장 재생
- 선택 분량 전체 이어듣기
- 재생 중 본문 모달 동기화

### 9.8 중보기도 잠금

- 잠금은 암호화 저장이 아님
- SHA-256 해시 비교 기반
- 민감 정보 보관용 보안 저장소로 간주하면 안 됨

---

## 10. PWA / 캐시 설계

### 10.1 Manifest

- 이름: `제자반 신앙생활`
- 짧은 이름: `제자반`
- `display: standalone`
- `orientation: portrait`
- 루트 스코프 사용

### 10.2 Service Worker

캐시 이름:

- `jejaban-app-v1`

캐시 전략:

- HTML / JS / JSON: network-first
- 기타 리소스: cache-first

로컬 예외:

- `localhost`, `127.0.0.1`는 캐시 로직 비활성화

---

## 11. 라우팅 정책

- `/`
- `/memorize/`
- `/bible-read/`
- `/prayer/`

슬래시 보정:

- `/memorize` -> `/memorize/`
- `/bible-read` -> `/bible-read/`
- `/prayer` -> `/prayer/`

상태 URL:

- 암송: `?week=`
- 읽기: `?day=`

---

## 12. 알려진 한계와 주의사항

### 12.1 가장 중요한 현재 한계

- `42주 성경 1독` 데이터는 현재 실제 JPG 표를 완전 검수한 최종판이 아니다
- 현재는 기존 읽기표를 `42주 x 7일` 형식으로 변환한 중간 데이터다

즉, UI와 로직은 운영 가능하지만
실제 제자반 표와 1:1 일치 여부는 별도 검수가 필요하다.

### 12.2 저장소 리스크

- 모든 사용자 데이터는 로컬 저장소 기반
- 브라우저 데이터 삭제 시 유실 가능
- 기기 간 자동 동기화 없음

### 12.3 외부 의존 리스크

- GOODTV URL 정책 변경 시 오디오 기능 영향 가능
- CDN 접근 불가 시 일부 UI 의존성 영향 가능

### 12.4 기술 부채

- `prayer` 저장 키가 `nalmada-*` 이름을 유지 중
- `tools/`에 임시/실험용 파일이 일부 남아 있음
- `index copy.html`은 서비스 비핵심 백업 파일 성격

---

## 13. 운영 체크리스트

- `bible-read/data.json`과 실제 제자반 표 대조
- `memorize/data.json` 32주 데이터 최종 검수
- 운영 도메인 canonical/OG URL 최종 확인
- GOODTV 오디오 정상 동작 확인
- iOS 설치 안내 확인
- 다크모드 / 글자 크기 전역 반영 확인
- Service Worker 캐시 갱신 정책 점검

---

## 14. 결론

현재 프로젝트는 `제자반 신앙생활`을 위한 정적 PWA이며,
핵심 구조는 다음 4가지로 요약된다.

- 페이지별 독립 실행 구조
- JSON 데이터 중심 콘텐츠 관리
- `localStorage` 기반 개인 진도 저장
- 공통 UX 모듈을 통한 일관된 사용 경험

현재 시점에서 가장 우선되는 후속 작업은
`42주 성경 1독` 데이터의 실제 제자반 표 검수 및 확정이다.
