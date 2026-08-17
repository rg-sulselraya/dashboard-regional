exports.handler = async function handler(event) {
  const gid = event?.queryStringParameters?.gid || "0";
  const sheet = event?.queryStringParameters?.sheet || "";
  const range = event?.queryStringParameters?.range || "";
  const base = "https://docs.google.com/spreadsheets/d/1Ay9OPNDLYI0SKsZ4_98y2mqR_y3mVWOwBRhpN8hADJU";
  const url = sheet
    ? `${base}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}${range ? `&range=${encodeURIComponent(range)}` : ""}`
    : `${base}/export?format=csv&gid=${encodeURIComponent(gid)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: `Google Sheets returned ${response.status}`,
      };
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
      body: await response.text(),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: error.message || "Refresh failed",
    };
  }
};
