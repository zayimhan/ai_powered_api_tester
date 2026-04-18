"use strict";
const express = require("express");
const router = express.Router();
const executionService = require("../services/execution.service");

const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

router.post("/execute-raw", async (req, res) => {
  if (!INTERNAL_TOKEN || req.headers["x-internal-token"] !== INTERNAL_TOKEN) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    const result = await executionService.execute(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
