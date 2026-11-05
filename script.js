/**
 * 실시간 시도별 대기오염 측정 정보 웹 애플리케이션
 * 
 * [API 명세]
 * - 공공데이터포털: 한국환경공단 에어코리아 대기오염정보 (시도별 실시간 측정정보 조회)
 * - 엔드포인트: https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty
 * - 파라미터: serviceKey, returnType=json, sidoName, numOfRows=100, pageNo=1, ver=1.3
 */

// 1. 기본 설정
const CONFIG = {
  // Vercel 서버리스 함수 엔드포인트 (배포 시 process.env.KEY 사용)
  SERVERLESS_API_URL: '/api/dust',
  // 직접 호출 폴백용 공공데이터 엔드포인트
  DIRECT_API_URL: 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty',
  SERVICE_KEY: '',
  NUM_OF_ROWS: 100,
  PAGE_NO: 1,
  VER: '1.3',
  RETURN_TYPE: 'json'
};

// 현재 로드된 데이터 상태
let currentItems = [];

// DOM 요소 참조
const serviceKeyInput = document.getElementById('serviceKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const searchForm = document.getElementById('searchForm');
const sidoSelect = document.getElementById('sidoSelect');
const mockBtn = document.getElementById('mockBtn');
const sortSelect = document.getElementById('sortSelect');
const currentStatusText = document.getElementById('currentStatusText');

const summarySection = document.getElementById('summarySection');
const selectedRegionName = document.getElementById('selectedRegionName');
const dataTimeBadge = document.getElementById('dataTimeBadge');
const totalStationCount = document.getElementById('totalStationCount');
const avgPm10 = document.getElementById('avgPm10');
const avgPm25 = document.getElementById('avgPm25');
const avgO3 = document.getElementById('avgO3');
const validPm10Count = document.getElementById('validPm10Count');
const validPm25Count = document.getElementById('validPm25Count');
const validO3Count = document.getElementById('validO3Count');

const stationGrid = document.getElementById('stationGrid');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  // 로컬 스토리지에 저장된 키가 있으면 불러오기, 없으면 기본 설정값 반영
  const savedKey = localStorage.getItem('AIR_API_SERVICE_KEY');
  if (savedKey) {
    CONFIG.SERVICE_KEY = savedKey;
    serviceKeyInput.value = savedKey;
  } else if (CONFIG.SERVICE_KEY && CONFIG.SERVICE_KEY !== 'YOUR_SERVICE_KEY_HERE') {
    serviceKeyInput.value = CONFIG.SERVICE_KEY;
  }

  // 기본 안내 상태 렌더링
  renderInitialState();
});

// 키 저장 버튼 이벤트
saveKeyBtn.addEventListener('click', () => {
  const newKey = serviceKeyInput.value.trim();
  if (!newKey) {
    alert('인증키를 입력해주세요.');
    return;
  }
  CONFIG.SERVICE_KEY = newKey;
  localStorage.setItem('AIR_API_SERVICE_KEY', newKey);
  alert('인증키가 성공적으로 적용되었습니다.');
});

// 조회 폼 제출 이벤트
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sidoName = sidoSelect.value;
  const directKey = serviceKeyInput.value.trim() || CONFIG.SERVICE_KEY;

  fetchAirData(sidoName, directKey);
});

// 샘플(Mock) 데이터로 테스트 버튼 이벤트
mockBtn.addEventListener('click', () => {
  const sidoName = sidoSelect.value;
  loadMockData(sidoName);
});

// 정렬 변경 이벤트
sortSelect.addEventListener('change', () => {
  if (currentItems.length > 0) {
    sortAndRenderItems();
  }
});

/**
 * 대기오염 측정 데이터 조회 함수
 * 1. Vercel 서버리스 함수 (/api/dust) 우선 호출 (서버 환경변수 KEY 사용)
 * 2. file:// 환경 또는 수동 키 입력 시 공공데이터 직접 호출로 폴백
 */
async function fetchAirData(sidoName, directKey) {
  showLoading(true);
  hideError();
  updateStatusBadge(`조회 중 (${sidoName})`, 'active');

  try {
    let data;

    // file:// 프로토콜이 아니고 서버리스 엔드포인트가 존재하는 경우 우선 호출
    const isLocalFile = window.location.protocol === 'file:';
    
    if (!isLocalFile && !directKey) {
      // Vercel 서버리스 함수 호출 (/api/dust)
      const res = await fetch(`${CONFIG.SERVERLESS_API_URL}?sidoName=${encodeURIComponent(sidoName)}`);
      const resData = await res.json();

      if (!res.ok || resData.error) {
        throw new Error(resData.error || `서버 오류 (${res.status})`);
      }
      data = resData;
    } else {
      // 수동 인증키가 있거나 file:// 로컬 테스트인 경우
      const key = directKey || CONFIG.SERVICE_KEY;
      if (!key) {
        // 서버리스 함수 시도
        try {
          const res = await fetch(`${CONFIG.SERVERLESS_API_URL}?sidoName=${encodeURIComponent(sidoName)}`);
          const resData = await res.json();
          if (!res.ok || resData.error) {
            throw new Error(resData.error || `서버 오류 (${res.status})`);
          }
          data = resData;
        } catch (serverlessErr) {
          throw new Error('Vercel 환경변수 KEY 또는 화면 상단의 인증키를 입력해주세요. 로컬 확인은 [샘플 데이터로 테스트]를 누르시면 됩니다.');
        }
      } else {
        const params = new URLSearchParams({
          serviceKey: key,
          returnType: CONFIG.RETURN_TYPE,
          numOfRows: String(CONFIG.NUM_OF_ROWS),
          pageNo: String(CONFIG.PAGE_NO),
          sidoName: sidoName,
          ver: CONFIG.VER
        });
        const directUrl = `${CONFIG.DIRECT_API_URL}?${params.toString()}`;
        const response = await fetch(directUrl);
        const text = await response.text();

        if (text.trim().startsWith('<') || text.includes('<?xml')) {
          throw new Error('인증키 또는 요청값을 확인해주세요.');
        }

        data = JSON.parse(text);
        if (data.response?.header?.resultCode !== '00') {
          throw new Error(`API 오류: ${data.response?.header?.resultMsg || '오류 발생'}`);
        }
      }
    }

    // 공공데이터 응답 구조 검증
    const body = data.response?.body;
    if (!body || !body.items) {
      const headerMsg = data.response?.header?.resultMsg || '응답 데이터 형식이 올바르지 않습니다.';
      throw new Error(`API 오류: ${headerMsg}`);
    }

    currentItems = body.items;
    
    if (currentItems.length === 0) {
      showError(`${sidoName} 지역에 조회된 측정소 데이터가 없습니다.`);
      renderEmpty();
    } else {
      updateStatusBadge(`정상 수신 (${currentItems.length}개소)`, 'active');
      renderDashboard(sidoName, currentItems);
    }
  } catch (err) {
    console.error('API Fetch Error:', err);
    let msg = err.message || '데이터를 가져오는데 실패했습니다.';
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      msg = 'CORS 제한 또는 네트워크 오류가 발생했습니다. Vercel에 배포하시면 /api/dust 서버리스 함수를 통해 정상 작동합니다.';
    }
    showError(msg);
  } finally {
    showLoading(false);
  }
}

/**
 * 대시보드 및 통계, 카드 렌더링
 */
function renderDashboard(sidoName, items) {
  selectedRegionName.textContent = sidoName;

  // 가장 최신 측정 시간 표시
  const latestTime = items[0]?.dataTime || '-';
  dataTimeBadge.textContent = `기준 일시: ${latestTime}`;

  // 통계 계산 (조건: "-" 측정값은 평균 계산에서 제외)
  calculateSummary(items);

  // 카드 정렬 및 렌더링
  sortAndRenderItems();

  summarySection.style.display = 'block';
}

/**
 * [조건 처리] 통계 요약 계산
 * - 측정값이 "-" 로 오면 숫자로 계산하지 않고 평균을 낼 때도 제외
 */
function calculateSummary(items) {
  let pm10Sum = 0;
  let pm10Count = 0;

  let pm25Sum = 0;
  let pm25Count = 0;

  let o3Sum = 0;
  let o3Count = 0;

  items.forEach(item => {
    // 미세먼지 PM10
    const pm10Val = parseNumericValue(item.pm10Value);
    if (pm10Val !== null) {
      pm10Sum += pm10Val;
      pm10Count++;
    }

    // 초미세먼지 PM2.5
    const pm25Val = parseNumericValue(item.pm25Value);
    if (pm25Val !== null) {
      pm25Sum += pm25Val;
      pm25Count++;
    }

    // 오존 O3
    const o3Val = parseNumericValue(item.o3Value);
    if (o3Val !== null) {
      o3Sum += o3Val;
      o3Count++;
    }
  });

  totalStationCount.textContent = `${items.length}곳`;

  // 미세먼지 평균
  if (pm10Count > 0) {
    avgPm10.textContent = `${Math.round(pm10Sum / pm10Count)} ㎍/㎥`;
    validPm10Count.textContent = `(유효 측정소 ${pm10Count}곳)`;
  } else {
    avgPm10.textContent = '측정 안 됨';
    validPm10Count.textContent = '(유효 측정소 0곳)';
  }

  // 초미세먼지 평균
  if (pm25Count > 0) {
    avgPm25.textContent = `${Math.round(pm25Sum / pm25Count)} ㎍/㎥`;
    validPm25Count.textContent = `(유효 측정소 ${pm25Count}곳)`;
  } else {
    avgPm25.textContent = '측정 안 됨';
    validPm25Count.textContent = '(유효 측정소 0곳)';
  }

  // 오존 평균
  if (o3Count > 0) {
    avgO3.textContent = `${(o3Sum / o3Count).toFixed(3)} ppm`;
    validO3Count.textContent = `(유효 측정소 ${o3Count}곳)`;
  } else {
    avgO3.textContent = '측정 안 됨';
    validO3Count.textContent = '(유효 측정소 0곳)';
  }
}

/**
 * [조건 처리] 숫자 변환 헬퍼 함수
 * "-" 이거나 공백, null, NaN일 경우 null 반환 (평균 계산에서 제외하기 위함)
 */
function parseNumericValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (str === '-' || str === '' || str === 'null') return null;
  
  const num = Number(str);
  return isNaN(num) ? null : num;
}

/**
 * [조건 처리] 화면 표시용 측정값 포맷터
 * 측정값이 "-" 로 오면 숫자로 계산하지 않고 "측정 안 됨"이라고 표시
 */
function formatMeasureValue(value, unit = '') {
  if (value === undefined || value === null) {
    return `<span class="metric-val unmeasured">측정 안 됨</span>`;
  }
  const str = String(value).trim();
  if (str === '-' || str === '' || str === 'null') {
    return `<span class="metric-val unmeasured">측정 안 됨</span>`;
  }
  return `<span class="metric-val">${str} ${unit}</span>`;
}

/**
 * [조건 처리] 등급 정보 파싱 및 카드 클래스/텍스트 결정
 * 등급 값이 비어 있을 수도 있으니 그때는 회색 카드로 처리
 */
function getGradeInfo(gradeValue) {
  // 등급 값이 없거나 비어있는 경우
  if (!gradeValue || String(gradeValue).trim() === '' || String(gradeValue).trim() === '-' || gradeValue === '0') {
    return {
      cardClass: 'card-grade-empty',
      text: '등급 없음 (미측정)',
      icon: 'fa-solid fa-question',
      badgeClass: 'badge-grade-empty'
    };
  }

  const grade = String(gradeValue).trim();
  switch (grade) {
    case '1':
      return {
        cardClass: 'card-grade-1',
        text: '좋음 (1등급)',
        icon: 'fa-solid fa-face-smile',
        badgeClass: 'badge-grade-1'
      };
    case '2':
      return {
        cardClass: 'card-grade-2',
        text: '보통 (2등급)',
        icon: 'fa-solid fa-face-meh',
        badgeClass: 'badge-grade-2'
      };
    case '3':
      return {
        cardClass: 'card-grade-3',
        text: '나쁨 (3등급)',
        icon: 'fa-solid fa-face-frown',
        badgeClass: 'badge-grade-3'
      };
    case '4':
      return {
        cardClass: 'card-grade-4',
        text: '매우 나쁨 (4등급)',
        icon: 'fa-solid fa-face-dizzy',
        badgeClass: 'badge-grade-4'
      };
    default:
      // 비어있거나 예상 외의 값은 전부 회색 처리
      return {
        cardClass: 'card-grade-empty',
        text: `등급 없음 (${grade})`,
        icon: 'fa-solid fa-question',
        badgeClass: 'badge-grade-empty'
      };
  }
}

/**
 * 정렬 후 카드 렌더링
 */
function sortAndRenderItems() {
  const sortMode = sortSelect.value;
  const sorted = [...currentItems].sort((a, b) => {
    if (sortMode === 'stationName') {
      return (a.stationName || '').localeCompare(b.stationName || '', 'ko');
    }
    if (sortMode === 'pm10Desc') {
      const vA = parseNumericValue(a.pm10Value) ?? -9999;
      const vB = parseNumericValue(b.pm10Value) ?? -9999;
      return vB - vA;
    }
    if (sortMode === 'pm10Asc') {
      const vA = parseNumericValue(a.pm10Value) ?? 9999;
      const vB = parseNumericValue(b.pm10Value) ?? 9999;
      return vA - vB;
    }
    if (sortMode === 'pm25Desc') {
      const vA = parseNumericValue(a.pm25Value) ?? -9999;
      const vB = parseNumericValue(b.pm25Value) ?? -9999;
      return vB - vA;
    }
    return 0;
  });

  renderCards(sorted);
}

/**
 * 측정소 카드 HTML 생성 및 주입
 */
function renderCards(items) {
  stationGrid.innerHTML = '';

  items.forEach(item => {
    // 통합대기환경지수 등급(khaiGrade)을 우선 확인하고, 없으면 pm10/pm25 등급 참고
    // 조건: 등급 값이 비어 있을 때 회색 카드 처리
    const rawGrade = item.khaiGrade || item.pm10Grade || '';
    const gradeInfo = getGradeInfo(rawGrade);

    const card = document.createElement('article');
    card.className = `station-card ${gradeInfo.cardClass}`;

    card.innerHTML = `
      <div class="card-header">
        <h3 class="station-name">${item.stationName || '측정소 미상'}</h3>
        <span class="grade-pill">
          <i class="${gradeInfo.icon}"></i> ${gradeInfo.text}
        </span>
      </div>

      <div class="metrics-list">
        <div class="metric-item">
          <span class="metric-label">미세먼지 (PM10)</span>
          ${formatMeasureValue(item.pm10Value, '㎍/㎥')}
        </div>
        <div class="metric-item">
          <span class="metric-label">초미세먼지 (PM2.5)</span>
          ${formatMeasureValue(item.pm25Value, '㎍/㎥')}
        </div>
        <div class="metric-item">
          <span class="metric-label">오존 (O₃)</span>
          ${formatMeasureValue(item.o3Value, 'ppm')}
        </div>
        <div class="metric-item">
          <span class="metric-label">이산화질소 (NO₂)</span>
          ${formatMeasureValue(item.no2Value, 'ppm')}
        </div>
        <div class="metric-item">
          <span class="metric-label">일산화탄소 (CO)</span>
          ${formatMeasureValue(item.coValue, 'ppm')}
        </div>
        <div class="metric-item">
          <span class="metric-label">아황산가스 (SO₂)</span>
          ${formatMeasureValue(item.so2Value, 'ppm')}
        </div>
      </div>

      <div class="card-footer">
        <span>통합수치: ${item.khaiValue && item.khaiValue !== '-' ? item.khaiValue : '측정 안 됨'}</span>
        <span>${item.dataTime || ''}</span>
      </div>
    `;

    stationGrid.appendChild(card);
  });
}

/**
 * 초기 상태 및 빈 화면 안내
 */
function renderInitialState() {
  stationGrid.innerHTML = `
    <div class="empty-result">
      <i class="fa-solid fa-cloud-sun"></i>
      <p>조회할 시도를 선택하고 <strong>[실시간 조회]</strong> 또는 <strong>[샘플 데이터로 테스트]</strong>를 눌러주세요.</p>
    </div>
  `;
}

function renderEmpty() {
  stationGrid.innerHTML = `
    <div class="empty-result">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <p>조회된 측정 데이터가 없습니다.</p>
    </div>
  `;
}

function showLoading(show) {
  loadingSpinner.style.display = show ? 'block' : 'none';
  if (show) {
    stationGrid.innerHTML = '';
  }
}

function showError(msg) {
  errorText.textContent = msg;
  errorMessage.style.display = 'flex';
}

function hideError() {
  errorMessage.style.display = 'none';
}

function updateStatusBadge(text, className = '') {
  currentStatusText.textContent = text;
  currentStatusText.className = `status-badge ${className}`;
}

/**
 * [조건 테스트용 샘플 데이터 생성]
 * - "-" 측정값 포함 (평균 제외 및 "측정 안 됨" 확인용)
 * - 등급 값이 비어있는 경우 포함 (회색 카드 확인용)
 * - 1등급(좋음), 2등급(보통), 3등급(나쁨), 4등급(매우나쁨) 카드 확인용
 */
function loadMockData(sidoName) {
  hideError();
  updateStatusBadge(`샘플 데이터 모드 (${sidoName})`, 'active');

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:00`;

  currentItems = [
    {
      stationName: `${sidoName} 종로구`,
      dataTime: timeStr,
      pm10Value: '18',
      pm25Value: '9',
      o3Value: '0.025',
      no2Value: '0.015',
      coValue: '0.4',
      so2Value: '0.003',
      khaiGrade: '1',
      khaiValue: '42'
    },
    {
      stationName: `${sidoName} 중구`,
      dataTime: timeStr,
      pm10Value: '45',
      pm25Value: '21',
      o3Value: '0.038',
      no2Value: '0.028',
      coValue: '0.5',
      so2Value: '0.004',
      khaiGrade: '2',
      khaiValue: '68'
    },
    {
      stationName: `${sidoName} 강남구`,
      dataTime: timeStr,
      pm10Value: '88',
      pm25Value: '42',
      o3Value: '0.095',
      no2Value: '0.045',
      coValue: '0.7',
      so2Value: '0.005',
      khaiGrade: '3',
      khaiValue: '115'
    },
    {
      stationName: `${sidoName} 영등포구 (매우나쁨)`,
      dataTime: timeStr,
      pm10Value: '165',
      pm25Value: '82',
      o3Value: '0.160',
      no2Value: '0.075',
      coValue: '1.2',
      so2Value: '0.012',
      khaiGrade: '4',
      khaiValue: '210'
    },
    {
      // 조건 검증: 측정값에 "-" 포함된 경우 ("측정 안 됨" 표시 및 평균 계산에서 제외되는지 확인)
      stationName: `${sidoName} 마포구 (일부 미측정)`,
      dataTime: timeStr,
      pm10Value: '-',
      pm25Value: '15',
      o3Value: '-',
      no2Value: '0.020',
      coValue: '-',
      so2Value: '0.002',
      khaiGrade: '2',
      khaiValue: '55'
    },
    {
      // 조건 검증: 등급 값이 비어있는 경우 (회색 카드 처리 확인) 및 측정값 전부 "-"
      stationName: `${sidoName} 점검중 측정소 (등급 비어있음)`,
      dataTime: timeStr,
      pm10Value: '-',
      pm25Value: '-',
      o3Value: '-',
      no2Value: '-',
      coValue: '-',
      so2Value: '-',
      khaiGrade: '', // 등급 비어있음
      khaiValue: '-'
    },
    {
      // 조건 검증: khaiGrade가 null인 경우도 회색 카드로 처리
      stationName: `${sidoName} 관악산 (등급 null)`,
      dataTime: timeStr,
      pm10Value: '25',
      pm25Value: '-',
      o3Value: '0.040',
      no2Value: '0.010',
      coValue: '0.3',
      so2Value: '0.002',
      khaiGrade: null, // 등급 null
      khaiValue: '-'
    }
  ];

  renderDashboard(sidoName, currentItems);
}

