import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({ rejectUnauthorized: false });

export async function fetchAllGameData() {
  const res = await fetch("https://127.0.0.1:2999/liveclientdata/allgamedata", { agent });
  if (!res.ok) throw new Error("Live Client fetch failed: " + res.status);
  return res.json();
}
