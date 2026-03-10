const { searchPrimes, searchPrimesFast, getPhysicalCores } = require('./dist/index.js');

async function runBenchmarks() {
  console.log('🏃 Fast Prime Search - Benchmark Suite');
  console.log('='.repeat(60));
  console.log('CPU:', require('os').cpus()[0].model);
  console.log('Logical threads:', getPhysicalCores());
  console.log('');

  const tests = [
    { name: '1-1M', range: { start: 1, end: 1000000 }, expected: 78498 },
    { name: '1-10M', range: { start: 1, end: 10000000 }, expected: 664579 },
    { name: '1-100M', range: { start: 1, end: 100000000 }, expected: 5761455 },
  ];

  for (const test of tests) {
    console.log(`\n📊 ${test.name} Range`);
    console.log('-'.repeat(40));
    
    // Single thread
    let startTime = Date.now();
    const singleResult = await searchPrimes(test.range, { threads: 1, showProgress: false });
    const singleDuration = Date.now() - startTime;
    console.log(`  Single thread: ${(singleDuration/1000).toFixed(2)}s`);
    
    // 16 threads (all hyperthreads)
    startTime = Date.now();
    const multiResult = await searchPrimes(test.range, { threads: 16, showProgress: false });
    const multiDuration = Date.now() - startTime;
    console.log(`  16 threads:     ${(multiDuration/1000).toFixed(2)}s`);
    console.log(`  Speedup:       ${(singleDuration/multiDuration).toFixed(2)}x`);
    console.log(`  Primes/min:    ${(multiResult.primesPerMinute/1000000).toFixed(2)}M`);
    console.log(`  Primes found:  ${multiResult.count.toLocaleString()} (expected: ${test.expected.toLocaleString()})`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Benchmark complete!');
}

runBenchmarks().catch(console.error);
