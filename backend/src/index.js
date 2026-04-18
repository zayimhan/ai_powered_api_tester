require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const collectionRoutes = require('./routes/collection.routes');
const requestRoutes = require('./routes/request.routes');
const executionRoutes = require('./routes/execution.routes');
const scenarioRoutes = require('./routes/scenario.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/internal', internalRoutes);

app.listen(PORT, () => {
  console.log(`APIFlow backend running on port ${PORT}`);
});
