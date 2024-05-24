require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
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
      const companyLink = listing.querySelector(".company a").href;

      data.push({ companyLink });
    });
    return data;
  });

  const completeCompanyData = [];

  for (const job of jobs) {
    await page.goto(job.companyLink, { waitUntil: "load", timeout: 0 });

    const companyDetails = await page.evaluate(() => {
      const companyLink = Array.from(
        document.querySelectorAll(".company-links a"),
        el => el.href
      );
      const companyLogoUrl = Array.from(
        document.querySelectorAll(".company-attributes-logo img"),
        el => el.src
      );
      const companyDescription = Array.from(
        document.querySelectorAll(".company-description p"),
        el => el.innerText
      );

      return { companyLink, companyLogoUrl, companyDescription };
    });

    const completeData = { id: uuidv4(), ...companyDetails };

    completeCompanyData.push(completeData);

    // Store each company in DynamoDB
    await storeInDynamoDB(completeData);
  }

  console.log(JSON.stringify(completeCompanyData, null, 2)); // Output to console

  await browser.close();
}

async function storeInDynamoDB(companyData) {
  const params = {
    TableName: "Company", // DynamoDB table name
    Item: companyData,
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(`Stored company: ${companyData.id}`);
  } catch (error) {
    console.error("Error storing company in DynamoDB:", error);
  }
}

scrapeJobs();
