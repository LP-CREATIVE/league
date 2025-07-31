import { fetchChampSelectData, analyzePregameComps, monitorChampionSelect } from "./src/pregame.js";
import { getLCUCredentials } from "./src/lcu-connector.js";

async function testPregame() {
  console.log("Testing League Client pregame data collection...\n");
  
  // Check if League Client is running
  const credentials = getLCUCredentials();
  if (!credentials) {
    console.log("❌ League Client is not running!");
    console.log("Please start the League Client and try again.");
    return;
  }
  
  console.log("✅ League Client detected!");
  console.log(`   Port: ${credentials.port}`);
  
  // Try to fetch champion select data
  console.log("\n📊 Checking champion select status...");
  const champSelectData = await fetchChampSelectData();
  
  if (!champSelectData) {
    console.log("❌ Not in champion select!");
    console.log("Please enter a practice tool or normal game champion select and try again.");
    
    // Start monitoring anyway
    console.log("\n🔍 Starting champion select monitor...");
    console.log("I'll detect when you enter champion select and provide analysis.");
    
    monitorChampionSelect(async (analysis) => {
      console.log("\n=== CHAMPION SELECT ANALYSIS ===");
      console.log(analysis);
      console.log("================================\n");
    });
    
    // Keep the script running
    setInterval(() => {}, 1000);
    return;
  }
  
  console.log("✅ Champion select data found!");
  console.log(`   Phase: ${champSelectData.timer.phase}`);
  console.log(`   Your team size: ${champSelectData.myTeam.length}`);
  console.log(`   Enemy team size: ${champSelectData.theirTeam.length}`);
  
  // Generate analysis
  console.log("\n🤖 Generating pregame analysis...");
  const analysis = await analyzePregameComps(champSelectData);
  
  if (analysis) {
    console.log("\n=== PREGAME ANALYSIS ===");
    console.log(analysis);
    console.log("========================\n");
  } else {
    console.log("❌ Could not generate analysis. Make sure a jungler is selected.");
  }
  
  // Start continuous monitoring
  console.log("\n🔍 Starting continuous monitoring...");
  monitorChampionSelect(async (analysis) => {
    console.log("\n=== UPDATED ANALYSIS ===");
    console.log(analysis);
    console.log("========================\n");
  });
  
  // Keep the script running
  setInterval(() => {}, 1000);
}

// Run the test
testPregame().catch(console.error);