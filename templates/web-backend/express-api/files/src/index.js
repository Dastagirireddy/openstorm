import express from 'express';

const app = express();
const PORT = process.env.PORT || {{port}};

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello from {{project-name}}!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
