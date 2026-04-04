# PWA -> TWA 자동 빌드 플랫폼 설계서

## 1. 문서 목적

이 문서는 `PWABuilder`와 유사하게,
`PWA 사이트 URL`을 입력하면
`Trusted Web Activity(TWA)` 기반 Android 앱 프로젝트를 자동 생성하고,
최종적으로 `APK` 및 `AAB` 파일을 다운로드 가능한 형태로 제공하는
플랫폼을 설계하기 위한 개발 기준 문서이다.

이 문서의 목적은 다음과 같다.

- 다음 프로젝트에서 본 문서를 기준으로 바로 개발에 착수할 수 있게 한다.
- 요구사항, 시스템 구조, API, 데이터 모델, 보안, 빌드 파이프라인을 한 문서에 정리한다.
- 초기 MVP 범위와 향후 확장 범위를 명확히 구분한다.
- 개발자, 운영자, 디자이너, QA가 동일한 기준으로 의사결정할 수 있게 한다.

본 문서는 "설계용 개요"가 아니라
"실제 개발 착수 가능한 수준의 구현 설계 문서"를 목표로 한다.

---

## 2. 제품 개요

### 2.1 제품 목표

사용자가 PWA 웹사이트 정보를 입력하면,
시스템이 자동으로 다음 작업을 수행하는 플랫폼을 만든다.

- PWA 유효성 검사
- 웹 manifest 분석
- Android TWA 프로젝트 생성
- keystore 생성 또는 기존 keystore 사용
- Digital Asset Links용 `assetlinks.json` 생성
- Android release 빌드
- `APK` 및 `AAB` 산출물 생성
- 빌드 결과 다운로드 제공

### 2.2 핵심 가치

- 수작업 Android Studio 세팅 없이도 TWA 앱을 만들 수 있다.
- 비개발자 또는 저경험 개발자도 PWA를 Android 앱으로 쉽게 전환할 수 있다.
- 운영팀이 여러 PWA 사이트를 반복적으로 앱화할 수 있다.

### 2.3 제품 형태

- 웹 기반 관리자/사용자 UI
- 서버 기반 비동기 빌드 시스템
- Android 빌드 워커
- 빌드 산출물 다운로드 저장소

---

## 3. 용어 정의

### 3.1 PWA

- Web Manifest
- Service Worker
- HTTPS
- 설치 가능성

을 만족하는 웹앱

### 3.2 TWA

Android에서 Chrome 기반으로 PWA를 전체화면 앱처럼 실행하는 포장 방식

### 3.3 Bubblewrap

Google의 TWA 프로젝트 생성/빌드 도구

### 3.4 APK

직접 설치 가능한 Android 패키지 파일

### 3.5 AAB

Google Play Console 업로드용 Android App Bundle 파일

### 3.6 Build Job

사용자 요청 1건에 대해 생성되는 비동기 빌드 작업 단위

### 3.7 Signing Key

Android 앱 서명용 keystore / key alias / password 조합

---

## 4. 사용자 유형

### 4.1 개인 개발자

- 자신의 PWA 사이트를 앱으로 배포하고 싶다.
- Android 네이티브 지식이 부족하다.

### 4.2 웹 에이전시/운영팀

- 여러 고객 PWA를 반복적으로 TWA로 패키징해야 한다.
- keystore 관리, 앱 버전 관리, 빌드 이력을 체계화하고 싶다.

### 4.3 교회/단체 운영자

- 별도 앱 개발팀 없이 PWA를 앱 배포용으로 변환하고 싶다.

---

## 5. 문제 정의

현재 PWA를 TWA로 배포하려면 보통 다음 수작업이 필요하다.

- PWA 품질 점검
- manifest 확인
- Bubblewrap 설치
- TWA 프로젝트 생성
- Android SDK/Java 세팅
- keystore 준비
- assetlinks.json 생성
- release 빌드
- 서명 및 결과 검증

이 과정은 반복적이고 실수 가능성이 높다.

특히 다음 항목이 자주 문제를 일으킨다.

- 패키지명과 `assetlinks.json` 불일치
- SHA-256 fingerprint 불일치
- Android SDK/Java 경로 문제
- 빌드 도중 signing 실패
- 버전코드 관리 누락

따라서 이를 서버 기반 자동화 파이프라인으로 추상화할 필요가 있다.

---

## 6. 범위 정의

### 6.1 MVP 범위

- 사용자가 PWA URL 입력
- manifest 자동 조회 및 기본값 추출
- package id / app name / launcher name 편집 가능
- keystore 업로드 또는 신규 생성
- SHA-256 fingerprint 추출
- `assetlinks.json` 자동 생성
- Bubblewrap 기반 TWA 프로젝트 생성
- APK/AAB release 빌드
- 빌드 로그 조회
- 빌드 결과 다운로드
- 빌드 이력 저장

### 6.2 2차 확장 범위

- Play Console 메타데이터 템플릿 생성
- 스크린샷/아이콘 검증
- 멀티 테넌트 팀 관리
- 앱 버전 자동 증가 전략
- Netlify/Vercel/GitHub 연동
- `/.well-known/assetlinks.json` 자동 PR 생성 또는 자동 배포
- CI/CD 연동

### 6.3 범위 제외

- iOS WebView 앱 생성
- React Native / Flutter 앱 생성
- Play Console 직접 배포 API 자동화
- 완전 네이티브 기능 앱 생성

---

## 7. 주요 사용자 시나리오

### 7.1 기본 시나리오

1. 사용자가 프로젝트를 생성한다.
2. PWA URL을 입력한다.
3. 시스템이 manifest를 읽어 기본값을 채운다.
4. 사용자가 package id, 앱 이름, keystore 옵션을 입력한다.
5. 시스템이 PWA 검증을 수행한다.
6. 시스템이 빌드 잡을 생성한다.
7. 워커가 TWA 프로젝트를 생성하고 APK/AAB를 빌드한다.
8. 사용자는 결과 파일을 다운로드한다.
9. 사용자는 `assetlinks.json`을 사이트에 배포한다.

### 7.2 기존 keystore 사용 시나리오

1. 사용자가 기존 keystore 파일을 업로드한다.
2. alias / keystore password / key password를 입력한다.
3. 시스템이 fingerprint를 추출한다.
4. 해당 fingerprint로 `assetlinks.json`을 생성한다.

### 7.3 신규 keystore 생성 시나리오

1. 사용자가 신규 키 생성 옵션을 선택한다.
2. 시스템이 alias, 비밀번호, 인증서 메타데이터를 입력받는다.
3. 워커가 신규 keystore를 생성한다.
4. fingerprint를 추출해 저장한다.

### 7.4 재빌드 시나리오

1. 사용자가 기존 프로젝트의 설정을 수정한다.
2. 시스템이 새 버전 Build Job을 생성한다.
3. 기존 keystore를 재사용하여 APK/AAB를 다시 빌드한다.

---

## 8. 핵심 기능 요구사항

### 8.1 프로젝트 관리

- 프로젝트 생성/수정/삭제
- 프로젝트별 빌드 이력 관리
- 프로젝트별 keystore 연결
- 프로젝트 상태 표시

### 8.2 PWA 분석

- `manifest.webmanifest` 또는 `manifest.json` 탐지
- `name`, `short_name`, `start_url`, `scope`, `display`, `theme_color`, `icons` 분석
- HTTPS 여부 확인
- service worker 존재 여부 확인
- 설치 가능성 관련 경고 표시

### 8.3 TWA 설정 생성

- package id
- application name
- launcher name
- version code
- version name
- orientation
- theme color
- start url
- host
- fallback type

### 8.4 서명 처리

- 신규 keystore 생성
- 기존 keystore 업로드
- fingerprint 추출
- keystore 메타데이터 저장
- 민감정보 암호화 저장

### 8.5 빌드 처리

- Android SDK/Java/Bubblewrap 기반 빌드
- `apk` 및 `aab` 동시 생성
- 빌드 로그 수집
- 빌드 상태 업데이트
- 실패 원인 분류

### 8.6 결과물 제공

- signed APK 다운로드
- signed AAB 다운로드
- `assetlinks.json` 다운로드
- `twa-manifest.json` 다운로드
- 빌드 로그 조회

---

## 9. 비기능 요구사항

### 9.1 성능

- 일반적인 단일 빌드는 3분 이내 완료를 목표로 한다.
- 동시 빌드 요청을 큐로 처리한다.

### 9.2 확장성

- 웹 서버와 빌드 워커를 분리한다.
- 워커는 수평 확장이 가능해야 한다.

### 9.3 안정성

- 빌드 실패 시 중간 상태가 명확히 기록되어야 한다.
- 워커 장애 시 잡 재시도 정책이 있어야 한다.

### 9.4 보안

- keystore 파일과 비밀번호는 민감정보로 취급한다.
- 로그에 패스워드를 남기지 않는다.
- 다운로드 URL은 만료 시간을 가진 signed URL을 사용한다.

### 9.5 운영성

- 프로젝트별 빌드 이력 추적 가능
- 운영자용 실패 로그 확인 가능
- 버전 및 템플릿 관리 가능

---

## 10. 권장 기술 스택

다음 프로젝트의 구현 난이도, 운영성, 자동화 적합성을 기준으로 아래 스택을 권장한다.

### 10.1 프론트엔드

- Next.js 또는 React + Vite
- TypeScript
- Tailwind CSS

### 10.2 API 서버

- Node.js
- NestJS 또는 Express + TypeScript

### 10.3 빌드 워커

- Node.js
- BullMQ 기반 worker
- Bubblewrap CLI
- Android SDK
- JDK 17

### 10.4 DB

- PostgreSQL

### 10.5 캐시/큐

- Redis

### 10.6 파일 저장소

- S3 호환 스토리지
- 또는 로컬 저장소 + 추후 오브젝트 스토리지 이관

### 10.7 배포

- 웹/API 서버는 Linux 컨테이너
- Android 빌드 워커는 Android SDK 설치 가능한 Linux 또는 Windows 빌드 노드

권장 운영 방향:

- 웹/API는 Linux 컨테이너
- Android 빌드는 별도 전용 worker 노드

---

## 11. 상위 아키텍처

```text
[Web UI]
   |
   v
[API Server] ---- [PostgreSQL]
   |
   +---- [Redis / Queue]
   |
   +---- [Object Storage]
   |
   v
[Build Worker]
   |
   +---- Bubblewrap
   +---- Java / keytool / jarsigner
   +---- Android SDK / Gradle
```

### 11.1 구성 원칙

- 사용자 요청 처리와 빌드 실행을 분리한다.
- 빌드는 비동기 작업으로만 처리한다.
- 빌드 결과는 DB 메타데이터 + 파일 저장소 조합으로 관리한다.

---

## 12. 시스템 구성 상세

### 12.1 Web UI

역할:

- 프로젝트 생성/수정
- 빌드 시작
- 빌드 상태 보기
- 결과 다운로드
- assetlinks.json 보기

주요 화면:

- 로그인
- 프로젝트 목록
- 프로젝트 생성/편집
- 빌드 상세
- 결과 다운로드

### 12.2 API Server

역할:

- 인증/인가
- 프로젝트 CRUD
- 빌드 요청 생성
- keystore 메타데이터 저장
- 파일 업로드 처리
- 빌드 결과 조회

### 12.3 Build Worker

역할:

- PWA 분석
- Bubblewrap project 생성
- local.properties / 환경 구성
- Gradle 빌드
- APK/AAB 서명
- fingerprint 생성
- assetlinks.json 생성
- 산출물 업로드

---

## 13. 데이터 모델 설계

### 13.1 users

```text
id                  uuid pk
email               varchar unique
password_hash       varchar
name                varchar
role                varchar
created_at          timestamptz
updated_at          timestamptz
```

### 13.2 projects

```text
id                  uuid pk
owner_user_id       uuid fk users.id
name                varchar
description         text
site_url            varchar
manifest_url        varchar
package_id          varchar
app_name            varchar
launcher_name       varchar
host                varchar
start_url           varchar
theme_color         varchar
background_color    varchar
orientation         varchar
status              varchar
created_at          timestamptz
updated_at          timestamptz
```

### 13.3 signing_keys

```text
id                          uuid pk
project_id                  uuid fk projects.id
type                        varchar
alias                       varchar
keystore_file_path          varchar
keystore_original_name      varchar
certificate_sha1            varchar
certificate_sha256          varchar
subject_dn                  varchar
is_active                   boolean
created_at                  timestamptz
updated_at                  timestamptz
```

설명:

- `type`은 `uploaded | generated`
- keystore 비밀번호는 별도 secret storage 또는 암호화 컬럼 사용

### 13.4 builds

```text
id                        uuid pk
project_id                uuid fk projects.id
build_number              int
status                    varchar
triggered_by_user_id      uuid fk users.id
source_type               varchar
version_code              int
version_name              varchar
android_package_id        varchar
started_at                timestamptz
finished_at               timestamptz
failure_reason            text
created_at                timestamptz
updated_at                timestamptz
```

### 13.5 build_artifacts

```text
id                        uuid pk
build_id                  uuid fk builds.id
artifact_type             varchar
file_name                 varchar
file_path                 varchar
content_type              varchar
file_size                 bigint
checksum_sha256           varchar
created_at                timestamptz
```

artifact_type 예시:

- `apk`
- `aab`
- `assetlinks_json`
- `twa_manifest`
- `build_log`

### 13.6 build_logs

```text
id                        uuid pk
build_id                  uuid fk builds.id
log_level                 varchar
message                   text
created_at                timestamptz
```

### 13.7 secrets

권장:

- DB 직접 저장보다 KMS 또는 Secret Manager 사용
- 최소한 AES 암호화 저장

보관 대상:

- keystore password
- key password

---

## 14. 상태 모델

### 14.1 프로젝트 상태

- `draft`
- `ready`
- `archived`

### 14.2 빌드 상태

- `queued`
- `validating`
- `preparing`
- `building`
- `signing`
- `uploading`
- `completed`
- `failed`
- `cancelled`

---

## 15. API 설계

### 15.1 인증

#### `POST /api/auth/login`

입력:

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

출력:

```json
{
  "accessToken": "jwt",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User"
  }
}
```

### 15.2 프로젝트

#### `POST /api/projects`

입력:

```json
{
  "name": "My PWA App",
  "siteUrl": "https://example.com",
  "manifestUrl": "https://example.com/manifest.webmanifest"
}
```

동작:

- 프로젝트 생성
- manifest 자동 분석 시작 가능

#### `GET /api/projects`

- 프로젝트 목록 반환

#### `GET /api/projects/:projectId`

- 프로젝트 상세 반환

#### `PATCH /api/projects/:projectId`

입력:

```json
{
  "packageId": "com.example.app",
  "appName": "Example App",
  "launcherName": "Example",
  "startUrl": "/",
  "orientation": "portrait"
}
```

### 15.3 PWA 분석

#### `POST /api/projects/:projectId/analyze`

동작:

- 사이트/manifest 분석
- 결과 저장

응답 예시:

```json
{
  "manifestFound": true,
  "serviceWorkerDetected": true,
  "httpsValid": true,
  "warnings": []
}
```

### 15.4 keystore

#### `POST /api/projects/:projectId/signing-keys/upload`

입력:

- multipart file
- alias
- keystorePassword
- keyPassword

동작:

- keystore 저장
- fingerprint 추출

#### `POST /api/projects/:projectId/signing-keys/generate`

입력:

```json
{
  "alias": "mykey",
  "keystorePassword": "secret123",
  "keyPassword": "secret123",
  "fullName": "Example",
  "organizationalUnit": "android",
  "organization": "example.com",
  "country": "KR"
}
```

### 15.5 빌드

#### `POST /api/projects/:projectId/builds`

입력:

```json
{
  "versionCode": 1,
  "versionName": "1.0.0"
}
```

동작:

- Build Job 생성
- queue enqueue

#### `GET /api/projects/:projectId/builds`

- 빌드 목록 반환

#### `GET /api/builds/:buildId`

- 빌드 상세
- 로그 요약
- 아티팩트 목록

### 15.6 assetlinks

#### `GET /api/projects/:projectId/assetlinks.json`

출력:

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:..."
      ]
    }
  }
]
```

---

## 16. Build Worker 처리 흐름

### 16.1 워커 파이프라인

1. Build Job 로드
2. 프로젝트 설정 조회
3. PWA URL 및 manifest 확인
4. 사전 검증 수행
5. 작업 디렉터리 생성
6. Bubblewrap용 `twa-manifest.json` 생성
7. TWA Android 프로젝트 생성
8. Android SDK 경로 설정
9. release APK 빌드
10. APK 서명
11. release AAB 빌드
12. AAB 서명
13. fingerprint 재검증
14. `assetlinks.json` 생성
15. 산출물 업로드
16. DB 상태 갱신

### 16.2 실패 처리

실패 시 다음을 저장한다.

- 실패 단계
- 원인 메시지
- 표준 출력/표준 에러 로그
- 재시도 가능 여부

### 16.3 재시도 정책

- 네트워크 일시 오류: 최대 2회 재시도
- manifest fetch 실패: 재시도 가능
- keystore 비밀번호 오류: 재시도 불가
- signing 실패: 설정 수정 후 수동 재빌드 유도

---

## 17. Bubblewrap / Android 빌드 설계

### 17.1 기본 원칙

- Bubblewrap `init` 대화형 입력에 의존하지 않는다.
- `TwaManifest.fromWebManifest()` 또는 템플릿 기반 비대화형 생성 방식을 사용한다.
- 빌드 스크립트는 항상 재현 가능해야 한다.

### 17.2 생성 파일

워커 임시 디렉터리 예시:

```text
/workspace/builds/{buildId}/
├─ source/
├─ twa/
│  ├─ twa-manifest.json
│  ├─ local.properties
│  ├─ app-release-signed.apk
│  └─ app-release-signed.aab
└─ logs/
```

### 17.3 환경 의존성

- JDK 17
- Android SDK
- build-tools
- platform-tools
- Bubblewrap CLI
- Gradle Wrapper

### 17.4 서명 처리 원칙

- APK는 `apksigner` 사용
- AAB는 `jarsigner` 사용 또는 Gradle signing config 사용
- path 공백 이슈를 고려하여 직접 명령을 제어한다

### 17.5 버전 관리

- 프로젝트별 마지막 `versionCode`를 DB에 저장
- 새 빌드 시 기본값은 이전 값 + 1
- 사용자가 override 가능

---

## 18. PWA 검증 규칙

### 18.1 필수 검사

- URL이 HTTPS인지
- manifest 응답 성공 여부
- `name` 또는 `short_name` 존재 여부
- `start_url` 존재 여부
- `display` 존재 여부
- 아이콘 192, 512 존재 여부
- service worker 탐지 여부

### 18.2 경고 검사

- `display`가 `standalone`이 아닌 경우
- `theme_color` 누락
- maskable icon 누락
- assetlinks.json 미배포

### 18.3 결과 구조

```json
{
  "isValid": true,
  "errors": [],
  "warnings": [
    {
      "code": "MASKABLE_ICON_MISSING",
      "message": "Maskable icon is not defined."
    }
  ]
}
```

---

## 19. assetlinks.json 설계

### 19.1 생성 규칙

- package id와 signing certificate SHA-256 기반으로 생성
- relation은 MVP에서 아래 하나만 지원

```json
"delegate_permission/common.handle_all_urls"
```

### 19.2 출력 형식

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD"
      ]
    }
  }
]
```

### 19.3 제공 방식

- API 응답
- 다운로드 파일
- 화면 복사 버튼

2차 확장:

- GitHub PR 자동 생성
- Netlify deploy 연동

---

## 20. 보안 설계

### 20.1 민감정보

민감정보로 분류할 항목:

- keystore 파일
- keystore password
- key password
- signed artifact 다운로드 URL

### 20.2 저장 정책

- keystore 파일은 암호화된 저장소에 보관
- 비밀번호는 평문 저장 금지
- KMS 또는 Secret Manager 사용 권장

### 20.3 로그 정책

- 비밀번호 마스킹
- 명령행 출력에서 `--ks-pass`, `--key-pass` 값 제거
- stack trace 저장 시 민감값 필터링

### 20.4 접근 제어

- 프로젝트 소유자만 프로젝트/빌드 접근 가능
- 운영자만 시스템 로그 전체 접근 가능

### 20.5 산출물 접근

- 로그인 기반 접근
- 또는 짧은 만료시간 signed URL 발급

---

## 21. 운영 설계

### 21.1 로그 분리

- 애플리케이션 로그
- 빌드 로그
- 감사 로그

### 21.2 모니터링 항목

- build success rate
- 평균 빌드 시간
- 실패 단계 분포
- 큐 적체량
- 스토리지 사용량

### 21.3 관리자 기능

- 실패 빌드 재실행
- 프로젝트 비활성화
- 사용자 정지
- 워커 상태 확인

---

## 22. UI/UX 설계 개요

### 22.1 프로젝트 생성 화면

입력 필드:

- 프로젝트 이름
- 사이트 URL
- manifest URL 선택 입력

버튼:

- 사이트 분석
- 다음 단계

### 22.2 앱 설정 화면

입력 필드:

- package id
- app name
- launcher name
- version code
- version name
- orientation

### 22.3 서명 설정 화면

선택지:

- 기존 keystore 업로드
- 신규 keystore 생성

### 22.4 빌드 화면

표시 항목:

- 현재 상태
- 단계별 로그
- 예상 소요 시간
- 실패 시 원인 메시지

### 22.5 결과 화면

다운로드 버튼:

- APK 다운로드
- AAB 다운로드
- assetlinks.json 다운로드

보조 기능:

- SHA-256 복사
- package id 복사

---

## 23. 파일 구조 제안

다음 프로젝트 저장소 구조 권장안:

```text
/
├─ apps/
│  ├─ web/
│  └─ api/
├─ workers/
│  └─ android-builder/
├─ packages/
│  ├─ shared-types/
│  ├─ pwa-analyzer/
│  ├─ twa-generator/
│  ├─ signing/
│  └─ assetlinks/
├─ infra/
├─ docs/
│  └─ TWA_AUTOMATION_SPEC.md
└─ scripts/
```

### 23.1 모듈 역할

- `pwa-analyzer`
  - manifest fetch / validation
- `twa-generator`
  - bubblewrap/twa-manifest 생성
- `signing`
  - keytool/apksigner/jarsigner 래퍼
- `assetlinks`
  - assetlinks.json 생성기

---

## 24. 구현 우선순위

### 24.1 1단계

- 인증
- 프로젝트 CRUD
- PWA 분석
- keystore 업로드
- Build Job 큐 생성

### 24.2 2단계

- Bubblewrap 기반 Android 프로젝트 생성
- APK 빌드 및 서명
- AAB 빌드 및 서명
- 결과 다운로드

### 24.3 3단계

- assetlinks.json 자동 생성
- 빌드 로그 UI
- 버전 증가 정책

### 24.4 4단계

- 팀 기능
- GitHub/Netlify 연동
- 운영자 콘솔

---

## 25. 수용 기준

### 25.1 프로젝트 생성

- PWA URL 입력 후 프로젝트가 저장되어야 한다.
- manifest 분석 결과가 UI에 보여야 한다.

### 25.2 keystore 업로드

- 올바른 keystore 입력 시 SHA-256 fingerprint가 추출되어야 한다.
- 비밀번호 오류 시 명확한 오류가 표시되어야 한다.

### 25.3 빌드 성공

- 정상 PWA 기준으로 signed APK와 signed AAB가 생성되어야 한다.
- build status가 `completed`로 바뀌어야 한다.

### 25.4 assetlinks 생성

- package id와 SHA-256을 반영한 JSON이 생성되어야 한다.

### 25.5 로그

- 실패 시 실패 단계와 원인 로그가 남아야 한다.

---

## 26. 테스트 전략

### 26.1 단위 테스트

- manifest parser
- package id validator
- assetlinks generator
- fingerprint parser
- build status transition logic

### 26.2 통합 테스트

- 프로젝트 생성 -> keystore 업로드 -> 빌드 요청
- 빌드 완료 후 artifact 저장 확인

### 26.3 E2E 테스트

- UI에서 PWA URL 입력
- 빌드 실행
- 결과 다운로드

### 26.4 실환경 테스트

- 샘플 PWA 3종 이상으로 빌드 검증
- Play Console 업로드 가능한 AAB 확인

---

## 27. 위험요소 및 대응

### 27.1 Android SDK 환경 불안정

대응:

- 전용 워커 이미지 사용
- SDK 버전 고정

### 27.2 Bubblewrap 버전 변경

대응:

- wrapper 계층으로 캡슐화
- 버전 lock

### 27.3 keystore 유출 위험

대응:

- 저장 암호화
- 접근 제어 강화
- 로그 마스킹

### 27.4 사이트 품질 문제

대응:

- 분석 단계에서 오류/경고 분리
- 빌드 전 사전 검증 차단

### 27.5 long-running job

대응:

- 비동기 큐
- 단계별 heartbeat
- timeout 및 cleanup

---

## 28. 개발 체크리스트

- 프로젝트 기본 구조 생성
- 인증 모듈 구현
- 프로젝트 CRUD 구현
- manifest 분석기 구현
- keystore 업로드/생성 구현
- fingerprint 추출 구현
- Build Job 큐 구현
- Android worker 구현
- Bubblewrap project 생성 구현
- APK 빌드/서명 구현
- AAB 빌드/서명 구현
- assetlinks.json 생성 구현
- artifact 저장 구현
- 로그 저장 구현
- 빌드 UI 구현
- 다운로드 UI 구현

---

## 29. 초기 DB enum 제안

### 29.1 project_status

- `draft`
- `ready`
- `archived`

### 29.2 build_status

- `queued`
- `validating`
- `preparing`
- `building`
- `signing`
- `uploading`
- `completed`
- `failed`
- `cancelled`

### 29.3 artifact_type

- `apk`
- `aab`
- `assetlinks_json`
- `twa_manifest`
- `build_log`

---

## 30. 예시 Build Job payload

```json
{
  "buildId": "uuid",
  "projectId": "uuid",
  "siteUrl": "https://example.com",
  "manifestUrl": "https://example.com/manifest.webmanifest",
  "packageId": "com.example.app",
  "appName": "Example App",
  "launcherName": "Example",
  "startUrl": "/",
  "host": "example.com",
  "versionCode": 1,
  "versionName": "1.0.0",
  "orientation": "portrait",
  "signingKeyId": "uuid"
}
```

---

## 31. 구현 권장 원칙

- 모든 빌드는 완전 비대화형으로 처리한다.
- 대화형 CLI 입력은 서버 자동화에서 사용하지 않는다.
- 민감값은 항상 로그 마스킹한다.
- 빌드 재현성을 위해 버전과 경로를 고정한다.
- UI는 "설정 입력"보다 "자동 감지 + 필요한 값만 수정" 구조로 설계한다.

---

## 32. MVP 완료 정의

다음이 모두 가능하면 MVP 완료로 본다.

- 사용자가 PWA URL로 프로젝트 생성 가능
- manifest 분석 및 기본값 자동 채움 가능
- keystore 업로드 또는 생성 가능
- signed APK 생성 가능
- signed AAB 생성 가능
- assetlinks.json 생성 가능
- 빌드 로그 확인 가능
- 결과물 다운로드 가능

---

## 33. 결론

이 플랫폼은 본질적으로
"PWA 정보를 입력하면 Android TWA 앱 산출물을 안정적으로 생성하는 빌드 자동화 서비스"이다.

개발의 핵심은 다음 4가지다.

- PWA 분석의 정확성
- keystore/서명 처리의 안정성
- 비동기 빌드 파이프라인의 재현성
- 결과물과 `assetlinks.json`의 일관성

다음 프로젝트에서는 본 문서를 기준으로

1. `프로젝트/빌드/서명` 도메인 모델 구현
2. `PWA 분석기 + Android 빌드 워커` 구현
3. `결과 다운로드 UI` 구현

순서로 진행하는 것을 권장한다.
