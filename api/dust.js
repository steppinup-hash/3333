/**
 * Vercel Serverless Function: /api/dust
 * 
 * 공공데이터포털 대기오염정보 중계 서버리스 함수
 * 환경변수 process.env.KEY를 사용하여 클라이언트에 인증키 노출 방지
 */

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. 환경변수 KEY 확인
  const serviceKey = process.env.KEY;
  if (!serviceKey) {
    return res.status(500).json({
      error: '서버 환경변수 KEY가 설정되어 있지 않습니다. Vercel 환경변수 또는 .env.local을 확인해주세요.'
    });
  }

  // 2. 요청 파라미터 파싱
  const { sidoName = '서울', numOfRows = 100, pageNo = 1 } = req.query;

  try {
    // 환경변수 키와 시도이름을 URL 인코딩 처리
    const encodedKey = encodeURIComponent(serviceKey);
    const encodedSido = encodeURIComponent(sidoName);

    const apiUrl = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodedKey}&returnType=json&numOfRows=${numOfRows}&pageNo=${pageNo}&sidoName=${encodedSido}&ver=1.3`;

    const apiResponse = await fetch(apiUrl);
    const textData = await apiResponse.text();

    // 3. 응답이 XML(에러)인 경우 체크
    const trimmed = textData.trim();
    if (trimmed.startsWith('<') || trimmed.includes('<?xml') || trimmed.includes('<OpenAPI_ServiceResponse>')) {
      return res.status(400).json({
        error: '인증키 또는 요청값을 확인해주세요.',
        raw: textData
      });
    }

    // 4. JSON 파싱
    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (parseErr) {
      return res.status(400).json({
        error: '인증키 또는 요청값을 확인해주세요.',
        raw: textData
      });
    }

    // 5. 응답 본문 안의 resultCode 성공('00') 여부 검증
    const resultCode = jsonData.response?.header?.resultCode;
    const resultMsg = jsonData.response?.header?.resultMsg;

    if (resultCode !== '00') {
      return res.status(400).json({
        error: `공공데이터 API 오류가 발생했습니다: ${resultMsg || '결과 코드 ' + resultCode}`,
        resultCode: resultCode,
        resultMsg: resultMsg
      });
    }

    // 정상 결과 반환
    return res.status(200).json(jsonData);

  } catch (error) {
    return res.status(500).json({
      error: `서버 내부 오류가 발생했습니다: ${error.message}`
    });
  }
}

