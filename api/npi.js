export default async function handler(req, res) {
  const params = new URLSearchParams(req.query);
  params.set("version", "2.1");
  const url = `https://npiregistry.cms.hhs.gov/api/?${params}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "NPI Registry unreachable" });
  }
}
