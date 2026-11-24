# #BuildHybridAI 2026 — 규정 요약과 제출 체크리스트 (한국어)

원문: <https://firebasehybridaihackathon.devpost.com/rules> · 이벤트: <https://firebasehybridaihackathon.devpost.com/>
확인일: 2026-11-24
제출 저장소: <https://github.com/ddn9nd42hb-ai/Sitelog-hybrid-ai> (공개, main, Apache-2.0)

## 1. 일정 (한국시간 환산)

| 항목 | 원문 (PT) | 한국시간 |
| --- | --- | --- |
| 공모 시작 | 2026-11-11 13:30 PT | 2026-11-12 06:30 KST |
| **제출 마감** | **2026-11-30 14:00 PT** | **2026-12-01(화) 07:00 KST** |
| 심사 | 2026-12-10 ~ 12-16 | 2026-12-11 ~ 12-17 |
| 수상 발표 | 2026-12-21 경 | 2026-12-22경 |
| 구글 계정 쿼터 Sprint 3 신청 마감(선택) | 2026-11-25 10:00 PT | 2026-11-26(목) 03:00 KST |

마감 후 제출물 수정 불가. 마감 후 저장소에 푸시한 커밋은 심사에 반영되지 않음.

## 2. 참가 자격

- 제외국: 브라질, 이탈리아, 퀘벡, 크림반도, 러시아, 시리아, 수단, 벨라루스, 쿠바, 이란, **북한** — **대한민국은 제외 대상 아님**.
- 거주국 성년 연령 초과(한국 만 19세) → 2002-10-14생 충족.
- 미국 수출통제·제재 대상자 아님, 인터넷 접속 가능.
- 개인·팀·조직 모두 가능. 팀이면 Devpost에 팀원 전원 등록 + 대표 1인 지정.

## 3. 만들어야 하는 것

- **Firebase AI Logic**을 사용한 생성형 AI 앱. App Check 필수(디버그 토큰 허용), Remote Config/Firestore/Auth 등 추가 사용 권장.
- 플랫폼 1개 이상: **Web(Chrome) = Gemini Nano 4 via Firebase AI Logic**, Android, iOS(Apple Foundation Models). 멀티플랫폼은 그랜드프라이즈 가점.
- Web 온디바이스 요건: **Firebase AI Logic SDK v12.5.0+**, **Chrome 데스크톱 139+**, Prompt API 플래그(멀티모달) 활성화.
- 신규 프로젝트 또는 제출 기간 중 실질적으로 업데이트한 기존 앱. 기존 앱이면 제출 기간에 무엇을 만들었는지 요약 필수.
- 앱은 무료로 제공, 영어 지원 필수, 심사 기간(12-16)까지 심사자가 무료로 테스트 가능해야 함.

## 4. 필수 제출물 체크리스트

| # | 요건 | 상태 |
| --- | --- | --- |
| 1 | Devpost 계정 + 프로젝트 등록 | **미완 — 계정 없음(대행 불가, 사용자 필요)** |
| 2 | 공개 GitHub/GitLab 저장소 URL | **완료** — <https://github.com/ddn9nd42hb-ai/Sitelog-hybrid-ai> (공개, Apache-2.0) |
| 3 | 저장소에 오픈소스 라이선스 파일, About 영역에 표시 | 완료 — Apache-2.0 `LICENSE`(저작권자 Kim Yumin), GitHub 자동 인식 |
| 4 | Firebase AI Logic이 런타임에 실제 import·호출된 코드 (README 언급만으로 불가) | 준비 완료 (`src/ai/client.ts`) |
| 5 | 데모 영상 ≤3분, **YouTube 공개**, 영어 또는 영어 자막, 실제 동작 화면 | **미완 — 촬영 대본 준비 완료** (`docs/video-script.md`) |
| 6 | 영어 텍스트 설명(Firebase AI Logic 사용법·기능·가치제안) | 준비 완료 (`docs/devpost-submission.md`) |
| 7 | 플랫폼 1개 선택 | Web (Chrome) |
| 8 | 호스팅 URL(권장, 필수 아님) | 미완 — Firebase Hosting 배포 절차 문서화 |
| 9 | 테스트 안내(로그인 필요 시 계정 정보 포함) | 준비 완료 (로그인 불필요) |

## 5. 심사 기준 (Stage 2, 4개 항목 동등 가중, 각 1~5점)

1. **Technological Implementation** — Firebase AI Logic 하이브리드 추론을 얼마나 효과적으로 쓰는가
2. **Design** — 기술 데모가 아닌 완결된 제품 경험인가
3. **Potential Impact** — 실제 사용자의 실제 문제를 푸는가, 데모로 입증되는가
4. **Quality of the Idea** — 참신하고 비자명한 활용인가, 문제 공간을 이해하는가

SiteLog의 대응: 라우팅 정책을 화면에 노출(캡처 전 힌트 + 호출 후 트레이스), 스키마 검증 실패·저신뢰 시 클라우드 재시도(에스컬레이션), 오프라인 실동작, 건축·인테리어 현장이라는 구체적 수요.

## 6. 놓치기 쉬운 규칙

- 저장소에 **프로덕션 API 키·클라우드 시크릿·개인정보**를 넣으면 안 됨 → `.env`는 커밋 금지, App Check **디버그 토큰 절대 커밋 금지**.
- 저장소 라이선스는 About 사이드바에 보여야 함(GitHub가 `LICENSE` 자동 인식).
- 영상은 YouTube에 **공개(public)** 로 올리고 링크를 제출 폼에 기입.
- 제3자 SDK·API·데이터 사용 시 이용 권한 필요.
- 상금 수령 시 신원·역할 확인, 세금 관련 서류(Declaration of Eligibility 등) 제출 절차 있음.

## 7. 상금

총 $30,000 — 그랜드 프라이즈 $10,000, 플랫폼별 최우수 $3,000(Web/Android/iOS), 그 외 부문상. 수상팀은 Firebase 팀 인터뷰·블로그 기능.
