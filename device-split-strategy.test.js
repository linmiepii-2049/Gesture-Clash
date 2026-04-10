import assert from 'node:assert/strict';

function isMobileDevice(userAgent) {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    userAgent,
  );
}

function getCalibrationStrategy(userAgent) {
  const isMobile = isMobileDevice(userAgent);
  return {
    continuous: !isMobile,
    retryDelay: isMobile ? 120 : 280,
  };
}

function runTests() {
  const desktopUA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  const iphoneUA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15';
  const androidUA =
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36';

  assert.deepEqual(getCalibrationStrategy(desktopUA), {
    continuous: true,
    retryDelay: 280,
  });
  assert.deepEqual(getCalibrationStrategy(iphoneUA), {
    continuous: false,
    retryDelay: 120,
  });
  assert.deepEqual(getCalibrationStrategy(androidUA), {
    continuous: false,
    retryDelay: 120,
  });
}

runTests();
