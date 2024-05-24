require("dotenv").config();
const puppeteer = require("puppeteer");
const AWS = require("aws-sdk");

// Initialize DynamoDB DocumentClient
const dynamoDB = new AWS.DynamoDB.DocumentClient({
  region: "ap-south-1",
  accessKeyId: process.env.ACCESS_KEY,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

async function scrapeJobs() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.workingnomads.com/jobs");

  // Extract job listings
  const jobs = await page.evaluate(() => {
    const listings = document.querySelectorAll("#jobs .jobs-list .job-wrapper");
    const data = [];
    listings.forEach(listing => {
      const title = listing.querySelector(".open-button").innerText;
      const company = listing.querySelector(".company").innerText;
      const descriptionUrl = listing.querySelector(".open-button").href;
      const jobLocation = listing.querySelector(
        ".boxes .box .ng-binding"
      ).innerText;

      data.push({ title, company, descriptionUrl, jobLocation });
    });
    return data;
  });

  const completeJobsData = [];

  for (const job of jobs) {
    await page.goto(job.descriptionUrl, { waitUntil: "load", timeout: 0 });

    const jobDetails = await page.evaluate(() => {
      const paragraphs = Array.from(document.querySelectorAll("p")).map(
        p => p.innerText
      );
      return { description: paragraphs.join("\n\n") };
    });

    const completeJobData = { ...job, ...jobDetails };
    completeJobsData.push(completeJobData);

    // Store each job in DynamoDB
    await storeInDynamoDB(completeJobData);
  }

  console.log(JSON.stringify(completeJobsData, null, 2)); // Output to console

  await browser.close();
}

async function storeInDynamoDB(jobData) {
  const params = {
    TableName: "Jobs", // DynamoDB table name
    Item: jobData,
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(`Stored job: ${jobData.title}`);
  } catch (error) {
    console.error("Error storing job in DynamoDB:", error);
  }
}

scrapeJobs();
