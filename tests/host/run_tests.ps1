$ErrorActionPreference = 'Stop'
$root = 'E:\IoT'
$vcvars = 'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat'
$buildDir = Join-Path $root '.pio\host-test-build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

function Build-AndRun([string]$sourceList, [string]$outputPath, [string]$includeList) {
    $compile = 'call "' + $vcvars + '" >nul && cl.exe /nologo /EHsc /std:c++17 /utf-8 /DHOST_TEST /D_CRT_SECURE_NO_WARNINGS /W3 ' +
        $includeList + ' ' + $sourceList + ' /Fo:' + $buildDir + '\\ /Fe:' + $outputPath
    & $env:ComSpec /d /c $compile
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $outputPath
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$baseIncludes = '/I ' + $root + '\tests\host\stubs /I ' + $root + '\include'
$logicSources = $root + '\tests\host\test_firmware_logic.cpp ' +
    $root + '\src\schedule.cpp ' + $root + '\src\verification.cpp ' + $root + '\src\state_machine.cpp'
Build-AndRun $logicSources ($buildDir + '\firmware_logic_tests.exe') $baseIncludes

$cloudIncludes = '/I ' + $root + '\tests\host\cloud_stubs /I ' + $root + '\tests\host\stubs /I ' +
    $root + '\include /I ' + $root + '\.pio\libdeps\esp32dev\ArduinoJson\src'
$cloudSources = $root + '\tests\host\test_cloud_sync.cpp ' +
    $root + '\src\cloud_sync.cpp ' + $root + '\src\time_service.cpp ' + $root + '\src\schedule.cpp ' +
    $root + '\src\verification.cpp ' + $root + '\src\state_machine.cpp'
Build-AndRun $cloudSources ($buildDir + '\cloud_sync_tests.exe') $cloudIncludes
