const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Database
const db = new sqlite3.Database('./ngilo.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to ngilo.db');
  }
});

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creating users table:', err.message);
  }
});

// Create messages table
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  )
`, (err) => {
  if (err) {
    console.error('Error creating messages table:', err.message);
  }
});

// Home
app.get('/', (req, res) => {
  res.json({
    message: 'Server is running'
  });
});

// =========================
// SIGN UP
// =========================
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: 'Username and password are required.'
    });
  }

  try {
    // Check if username already exists
    db.get(
      'SELECT user_id FROM users WHERE username = ?',
      [username],
      async (err, existingUser) => {
        if (err) {
          console.error(err);
          return res.status(500).json({
            message: 'Database error.'
          });
        }

        if (existingUser) {
          return res.status(400).json({
            message: 'Username already exists.'
          });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        db.run(
          'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)',
          [userId, username, hashedPassword],
          function (err) {
            if (err) {
              console.error(err);
              return res.status(500).json({
                message: 'Failed to create account.'
              });
            }

            res.status(201).json({
              message: 'Account created successfully.',
              userId,
              username
            });
          }
        );
      }
    );
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Server error during signup.'
    });
  }
});

// =========================
// LOGIN
// =========================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: 'Username and password are required.'
    });
  }

  console.log('Login attempt:', username);

  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, user) => {
      if (err) {
        console.error('Database error:', err);

        return res.status(500).json({
          message: 'Server error.'
        });
      }

      // Username does not exist
      if (!user) {
        console.log('User not found:', username);

        return res.status(401).json({
          message: 'Invalid username or password.'
        });
      }

      try {
        const isMatch = await bcrypt.compare(
          password,
          user.password
        );

        if (!isMatch) {
          console.log('Wrong password for:', username);

          return res.status(401).json({
            message: 'Invalid username or password.'
          });
        }

        console.log('Login successful:', username);

        return res.status(200).json({
          message: 'Login successful.',
          userId: user.user_id,
          username: user.username
        });

      } catch (error) {
        console.error('Password comparison error:', error);

        return res.status(500).json({
          message: 'Server error.'
        });
      }
    }
  );
});

// =========================
// GET USERS
// =========================
app.get('/api/users01', (req, res) => {
  db.all(
    'SELECT username FROM users',
    [],
    (err, rows) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: 'Server error.'
        });
      }

      res.status(200).json(rows);
    }
  );
});

// =========================
// GET USER BY ID
// =========================
app.get('/api/user/:userId', (req, res) => {
  const { userId } = req.params;

  db.get(
    'SELECT username FROM users WHERE user_id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: 'Server error.'
        });
      }

      if (!row) {
        return res.status(404).json({
          message: 'User not found.'
        });
      }

      res.status(200).json({
        username: row.username
      });
    }
  );
});

// =========================
// GET FIRST USER
// =========================
app.get('/api/users', (req, res) => {
  db.get(
    'SELECT * FROM users LIMIT 1',
    (err, row) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: 'Server error.'
        });
      }

      if (!row) {
        return res.status(404).json({
          message: 'No users found.'
        });
      }

      res.status(200).json({
        username: row.username
      });
    }
  );
});

// =========================
// SEND MESSAGE
// =========================
app.post('/api/send-message', (req, res) => {
  const { recipientId, message } = req.body;

  if (!recipientId || !message) {
    return res.status(400).json({
      message: 'Recipient ID and message are required.'
    });
  }

  db.get(
    'SELECT user_id FROM users WHERE user_id = ?',
    [recipientId],
    (err, row) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: 'Server error.'
        });
      }

      if (!row) {
        return res.status(404).json({
          message: 'Recipient user not found.'
        });
      }

      db.run(
        'INSERT INTO messages (user_id, message) VALUES (?, ?)',
        [recipientId, message],
        (err) => {
          if (err) {
            console.error(err);

            return res.status(500).json({
              message: 'Failed to send message.'
            });
          }

          res.status(200).json({
            message: 'Message sent successfully.'
          });
        }
      );
    }
  );
});

// =========================
// GET MESSAGES
// =========================
app.get('/api/messages/:userId', (req, res) => {
  const { userId } = req.params;

  db.all(
    `
      SELECT message, timestamp
      FROM messages
      WHERE user_id = ?
      ORDER BY timestamp DESC
    `,
    [userId],
    (err, rows) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: 'Failed to retrieve messages.'
        });
      }

      res.status(200).json(rows);
    }
  );
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
