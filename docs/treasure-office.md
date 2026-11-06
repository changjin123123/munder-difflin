# 보물공방 Windows 통합판

개인용 빌드에서 상단의 **사무실**과 **보물공방**으로 전환합니다. 보물공방은 한국어 화면에서 빗썸 원화 현물과 빙엑스 USDT 무기한선물의 시세, 최신 뉴스, 모의 장부를 표시합니다. **전체 종목 모의 시작**과 **모의 중지**는 두 거래소를 함께 제어합니다. 장부의 현금과 손익은 KRW와 USDT로 나누어 표시합니다.

Windows 배포 파일에는 Python과 보물공방 엔진이 들어갑니다. 마우스로 보물공방을 열면 엔진이 백그라운드에서 시작되며, 모의매매는 버튼을 눌렀을 때 시작합니다. 통합판이 소유한 엔진은 통합판 종료 시 감시를 중지하고 장부를 보존합니다. 통합판은 자체 Munder 설정 폴더를 사용합니다.

### 빌드

1. 이 포크의 Node 20 및 Windows x64 Electron 32.3.3 의존성을 설치합니다. Electron과 호환되는 node-pty 및 better-sqlite3 바이너리가 필요합니다.
2. Windows x64 Python 3.12(Tk 포함)에서 `python tools/stage-treasure.py BOT_SOURCE.zip .treasure-stage`를 실행합니다. ZIP에는 최상위 폴더 하나와 `office_host.py`가 포함된 보물공방 소스가 있어야 합니다. 개인 데이터와 계정 설정은 포함하지 않습니다. 준비한 비공개 자산은 Git에서 제외됩니다.
3. `npm run build` 및 `npx electron-builder --win portable --x64 --config electron-builder.treasure.yml --publish never`를 실행합니다.

기본 장부 위치는 통합판 Electron userData 아래의 `treasure-engine/data`입니다. 기존 장부를 사용할 때는 같은 userData의 `treasure-location.json`에 `{"directory":"기존 보물공방 폴더의 절대 경로"}`를 저장한 뒤 앱을 다시 엽니다. 기존 보물공방이 그 장부를 사용 중이면 같은 Windows 사용자의 인증된 모의 전용 로컬 연결을 사용합니다. 화면에서 거래소 API 키를 요구하지 않습니다.
