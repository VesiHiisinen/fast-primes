const { searchPrimes, getPhysicalCores } = require('./dist/index.js');

async function compareThreads() {
  console.log('🔍 Thread Count Comparison');
  console.log('='.repeat(60));
  console.log('Testing range: 1-100M');
  console.log('');

  const range = { start: 1, end: 100000000 };
  const threadCounts = [1, 2, 4, 8, 12, 16];
  
  const results = [];
  
  for (const threads of threadCounts) {
    const startTime = Date.now();
    const result = await searchPrimes(range, { threads, showProgress: false });
    const duration = Date.now() - startTime;
    
    results.push({
      threads,
      duration,
      speedup: results.length > 0 ? results[0].duration / duration : 1,
      primesPerMin: (result.primesPerMinute / 1000000).toFixed(2)
    });
    
    console.log(`  ${String(threads).padStart(2)} threads: ${(duration/1000).toFixed(2)}s (${results[results.length-1].primesPerMin}M/min)`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📈 Results Summary:');
  console.log(`  Best thread count: ${results.reduce((a,b) => a.duration < b.duration ? a : b).threads}`);
  console.log(`  Max speedup: ${results[results.length-1].speedup.toFixed(2)}x`);
}

compareThreads().catch(console.error);
