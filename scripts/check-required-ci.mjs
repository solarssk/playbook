const input = process.env.CI_NEEDS;
let jobs;
try {
  jobs = JSON.parse(input ?? "");
} catch {
  console.error("Required CI results are missing or invalid.");
  process.exit(1);
}
if (!jobs || typeof jobs !== "object" || Array.isArray(jobs) ||
    Object.keys(jobs).length === 0 || Object.values(jobs).some((job) => job?.result !== "success")) {
  console.error("Not every required CI job succeeded.");
  process.exit(1);
}
console.log("All required CI jobs succeeded.");
