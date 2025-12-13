// server.js - API Wheelsun Backend COMPLÈTE avec locations
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const os = require("os");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ==================== FONCTION POUR OBTENIR L'IP ====================
function getNetworkIP() {
  console.log("🔍 Recherche de l'adresse IP réseau...");
  
  const interfaces = os.networkInterfaces();
  let wifiIP = null;
  let ethernetIP = null;
  let otherIP = null;

  for (const interfaceName in interfaces) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   📡 ${interfaceName}: ${iface.address}`);
        
        if (interfaceName.includes('Wi-Fi') || interfaceName.includes('WiFi') || interfaceName.includes('WLAN')) {
          wifiIP = iface.address;
        }
        else if (interfaceName.includes('Ethernet') && iface.address.startsWith('20.')) {
          ethernetIP = iface.address;
        }
        else if (!iface.address.startsWith('169.254')) {
          otherIP = iface.address;
        }
      }
    }
  }

  if (wifiIP) {
    console.log(`✅ IP WiFi sélectionnée: ${wifiIP}`);
    return wifiIP;
  }
  if (ethernetIP) {
    console.log(`✅ IP Ethernet sélectionnée: ${ethernetIP}`);
    return ethernetIP;
  }
  if (otherIP) {
    console.log(`✅ Autre IP sélectionnée: ${otherIP}`);
    return otherIP;
  }

  console.log("📍 Utilisation de localhost");
  return 'localhost';
}

const SERVER_IP = getNetworkIP();

// ==================== CONFIGURATION MYSQL ====================
console.log("\n🔧 Configuration MySQL:");
console.log("- Host:", process.env.DB_HOST || "localhost");
console.log("- User:", process.env.DB_USER || "root");
console.log("- Database:", process.env.DB_NAME || "wheelsun_db");
console.log("- Port:", process.env.DB_PORT || 3306);

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "wheelsun_db",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const db = mysql.createPool(dbConfig);

// ==================== CRÉATION DES TABLES SI ELLES N'EXISTENT PAS ====================
const createTables = () => {
  const tablesQueries = [
    // Table rentals pour gérer les locations
    `CREATE TABLE IF NOT EXISTS rentals (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      bike_id INT NOT NULL,
      station_id INT NOT NULL,
      hours INT NOT NULL,
      total_price DECIMAL(10,2) NOT NULL,
      status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
      start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      end_time TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE CASCADE,
      FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
    )`,
    
    // S'assurer que la table users existe
    `CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    
    // S'assurer que la table stations existe
    `CREATE TABLE IF NOT EXISTS stations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(50) NOT NULL,
      latitude DECIMAL(10,8) NOT NULL,
      longitude DECIMAL(11,8) NOT NULL,
      address VARCHAR(255) DEFAULT NULL,
      capacity INT DEFAULT 10,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // S'assurer que la table bikes existe
    `CREATE TABLE IF NOT EXISTS bikes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      station_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      battery_level INT DEFAULT 100,
      price_per_hour DECIMAL(5,2) DEFAULT 6.00,
      available BOOLEAN DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
    )`
  ];

  tablesQueries.forEach((query, index) => {
    db.query(query, (err) => {
      if (err) {
        console.error(`❌ Erreur création table ${index + 1}:`, err.message);
      } else {
        console.log(`✅ Table ${index + 1} vérifiée/créée`);
      }
    });
  });
};

// ==================== TEST CONNEXION MYSQL ====================
let isDbConnected = false;

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ ERREUR MYSQL:", err.message);
    console.log("⚠️  Mode simulation activé");
    isDbConnected = false;
  } else {
    console.log("✅ MySQL CONNECTÉ !");
    
    // Créer les tables si elles n'existent pas
    createTables();
    
    connection.query("SELECT DATABASE() as db", (err, result) => {
      if (!err && result[0]) {
        console.log("📊 Base de données:", result[0].db);
      }
    });
    
    isDbConnected = true;
    connection.release();
  }
});

const JWT_SECRET = process.env.JWT_SECRET || "wheelsun_secret_key";

// ==================== MIDDLEWARE AUTH ====================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token manquant" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token invalide" });
    }
    req.user = user;
    next();
  });
};

// ==================== ROUTES API ====================

// 1. RACINE - TEST API
app.get("/", (req, res) => {
  res.json({
    message: "🚀 API Wheelsun Backend",
    status: "online",
    version: "2.1.0",
    server_ip: SERVER_IP,
    database: isDbConnected ? "✅ MySQL connecté" : "⚠️ Mode simulation",
    features: ["stations", "bikes", "auth", "rentals"],
    endpoints: {
      auth: ["POST /api/register", "POST /api/login"],
      stations: "GET /api/stations",
      bikes: "GET /api/bikes/:stationId",
      rentals: ["POST /api/rent", "POST /api/end-rental", "GET /api/my-rentals/:userId"],
      profile: "GET /api/profile"
    }
  });
});

// 2. STATIONS
app.get("/api/stations", (req, res) => {
  console.log("🔍 /api/stations appelé");
  
  if (isDbConnected) {
    db.query(
      "SELECT id, name, latitude, longitude, address, capacity FROM stations ORDER BY name",
      (err, results) => {
        if (err) {
          console.error("❌ Erreur stations:", err);
          return sendFallbackStations(res);
        }
        
        console.log(`📍 ${results.length} stations depuis MySQL`);
        res.json(results);
      }
    );
  } else {
    console.log("⚠️  Mode simulation stations");
    sendFallbackStations(res);
  }
});

// 3. VÉLOS PAR STATION (EXCLUT LES VÉLOS LOUÉS)
app.get("/api/bikes/:stationId", (req, res) => {
  const stationId = parseInt(req.params.stationId);
  console.log(`🔍 /api/bikes/${stationId} appelé`);
  
  if (isDbConnected) {
    db.query(
      `SELECT b.id, b.name, b.battery_level as battery, b.price_per_hour as price, 
              b.available, s.name as station_name
       FROM bikes b
       JOIN stations s ON b.station_id = s.id
       WHERE b.station_id = ? 
       AND b.available = 1 
       AND b.id NOT IN (
         SELECT bike_id FROM rentals 
         WHERE status = 'active' 
         AND bike_id IS NOT NULL
       )
       ORDER BY b.name`,
      [stationId],
      (err, results) => {
        if (err) {
          console.error(`❌ Erreur bikes:`, err.message);
          return sendFallbackBikes(stationId, res);
        }
        
        console.log(`🚲 ${results.length} vélos DISPONIBLES pour station ${stationId}`);
        res.json(results);
      }
    );
  } else {
    sendFallbackBikes(stationId, res);
  }
});

// 4. VÉLOS LOUÉS PAR UTILISATEUR
app.get("/api/my-rentals/:userId", (req, res) => {
  const userId = parseInt(req.params.userId);
  console.log(`👤 Locations actives pour user ${userId}`);
  
  if (isDbConnected) {
    db.query(
      `SELECT r.id as rental_id, b.id as bike_id, b.name as bike_name, 
              b.battery_level as battery, s.name as station_name, 
              s.latitude, s.longitude, r.start_time, r.hours, r.total_price
       FROM rentals r
       JOIN bikes b ON r.bike_id = b.id
       JOIN stations s ON r.station_id = s.id
       WHERE r.user_id = ? AND r.status = 'active'
       ORDER BY r.start_time DESC`,
      [userId],
      (err, results) => {
        if (err) {
          console.error("❌ Erreur locations actives:", err.message);
          return res.json([]);
        }
        
        console.log(`📱 User ${userId} a ${results.length} location(s) active(s)`);
        res.json(results);
      }
    );
  } else {
    res.json([]);
  }
});

// 5. LOUER UN VÉLO
app.post("/api/rent", (req, res) => {
  console.log("🚲 Demande de location:", req.body);
  
  const { userId, bikeId, stationId, hours } = req.body;
  
  if (!userId || !bikeId || !stationId || !hours) {
    return res.status(400).json({
      success: false,
      message: "Données manquantes: userId, bikeId, stationId, hours requis"
    });
  }
  
  if (hours <= 0) {
    return res.status(400).json({
      success: false,
      message: "Nombre d'heures invalide"
    });
  }
  
  if (isDbConnected) {
    // Commencer une transaction
    db.getConnection((err, connection) => {
      if (err) {
        console.error("❌ Erreur connexion:", err);
        return res.status(500).json({
          success: false,
          message: "Erreur base de données"
        });
      }
      
      connection.beginTransaction(async (err) => {
        if (err) {
          connection.release();
          console.error("❌ Erreur transaction:", err);
          return res.status(500).json({
            success: false,
            message: "Erreur transaction"
          });
        }
        
        try {
          // 1. Vérifier si l'utilisateur a déjà un vélo loué
          connection.query(
            `SELECT id FROM rentals WHERE user_id = ? AND status = 'active'`,
            [userId],
            (err, activeRentals) => {
              if (err) {
                return rollbackAndRelease(connection, "Erreur vérification locations actives");
              }
              
              if (activeRentals.length > 0) {
                return rollbackAndRelease(connection, "Vous avez déjà un vélo loué");
              }
              
              // 2. Vérifier si le vélo est disponible
              connection.query(
                `SELECT available, price_per_hour FROM bikes WHERE id = ?`,
                [bikeId],
                (err, bikeResults) => {
                  if (err || bikeResults.length === 0) {
                    return rollbackAndRelease(connection, "Vélo non trouvé");
                  }
                  
                  const bike = bikeResults[0];
                  if (!bike.available) {
                    return rollbackAndRelease(connection, "Vélo non disponible");
                  }
                  
                  // 3. Calculer le prix total
                  const pricePerHour = parseFloat(bike.price_per_hour) || 6.00;
                  const totalPrice = pricePerHour * hours;
                  
                  // 4. Créer la location
                  connection.query(
                    `INSERT INTO rentals (user_id, bike_id, station_id, hours, total_price, status)
                     VALUES (?, ?, ?, ?, ?, 'active')`,
                    [userId, bikeId, stationId, hours, totalPrice],
                    (err, result) => {
                      if (err) {
                        return rollbackAndRelease(connection, "Erreur création location");
                      }
                      
                      const rentalId = result.insertId;
                      
                      // 5. Marquer le vélo comme non disponible
                      connection.query(
                        "UPDATE bikes SET available = 0 WHERE id = ?",
                        [bikeId],
                        (err) => {
                          if (err) {
                            return rollbackAndRelease(connection, "Erreur mise à jour vélo");
                          }
                          
                          // Tout est bon, commit
                          connection.commit((err) => {
                            if (err) {
                              return rollbackAndRelease(connection, "Erreur commit");
                            }
                            
                            console.log(`✅ Location ${rentalId} créée pour user ${userId}`);
                            
                            connection.query(
                              `SELECT r.id as rental_id, b.id as bike_id, b.name as bike_name, 
                                      b.battery_level as battery, s.name as station_name,
                                      s.latitude, s.longitude, r.start_time, r.hours, r.total_price
                               FROM rentals r
                               JOIN bikes b ON r.bike_id = b.id
                               JOIN stations s ON r.station_id = s.id
                               WHERE r.id = ?`,
                              [rentalId],
                              (err, rentalDetails) => {
                                connection.release();
                                
                                if (err || rentalDetails.length === 0) {
                                  return res.json({
                                    success: true,
                                    message: "Location créée mais erreur récupération détails",
                                    rentalId: rentalId
                                  });
                                }
                                
                                res.json({
                                  success: true,
                                  message: "Location confirmée",
                                  rental: rentalDetails[0]
                                });
                              }
                            );
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
          
        } catch (error) {
          rollbackAndRelease(connection, error.message);
        }
      });
    });
    
  } else {
    // Mode simulation
    const simulatedRental = {
      rental_id: Date.now(),
      bike_id: bikeId,
      bike_name: `Vélo ${bikeId}`,
      battery: 85,
      station_name: "Station simulée",
      latitude: 33.5731,
      longitude: -7.5898,
      start_time: new Date().toISOString(),
      hours: hours,
      total_price: hours * 6.00
    };
    
    res.json({
      success: true,
      message: "Location simulée (mode démo)",
      rental: simulatedRental
    });
  }
});

// 6. TERMINER UNE LOCATION
app.post("/api/end-rental", (req, res) => {
  console.log("🔚 Fin de location:", req.body);
  
  const { rentalId, userId } = req.body;
  
  if (!rentalId) {
    return res.status(400).json({
      success: false,
      message: "rentalId requis"
    });
  }
  
  if (isDbConnected) {
    db.getConnection((err, connection) => {
      if (err) {
        console.error("❌ Erreur connexion:", err);
        return res.status(500).json({
          success: false,
          message: "Erreur base de données"
        });
      }
      
      connection.beginTransaction((err) => {
        if (err) {
          connection.release();
          console.error("❌ Erreur transaction:", err);
          return res.status(500).json({
            success: false,
            message: "Erreur transaction"
          });
        }
        
        // 1. Récupérer le bike_id de la location
        connection.query(
          `SELECT bike_id, user_id FROM rentals WHERE id = ? AND status = 'active'`,
          [rentalId],
          (err, results) => {
            if (err || results.length === 0) {
              return rollbackAndRelease(connection, "Location non trouvée ou déjà terminée");
            }
            
            const rental = results[0];
            
            // Vérifier que l'utilisateur est bien le propriétaire (optionnel)
            if (userId && rental.user_id !== userId) {
              return rollbackAndRelease(connection, "Non autorisé");
            }
            
            const bikeId = rental.bike_id;
            
            // 2. Terminer la location
            connection.query(
              `UPDATE rentals SET status = 'completed', end_time = NOW() WHERE id = ?`,
              [rentalId],
              (err) => {
                if (err) {
                  return rollbackAndRelease(connection, "Erreur fin location");
                }
                
                // 3. Rendre le vélo disponible
                connection.query(
                  "UPDATE bikes SET available = 1 WHERE id = ?",
                  [bikeId],
                  (err) => {
                    if (err) {
                      return rollbackAndRelease(connection, "Erreur mise à jour vélo");
                    }
                    
                    // Commit
                    connection.commit((err) => {
                      if (err) {
                        return rollbackAndRelease(connection, "Erreur commit");
                      }
                      
                      console.log(`✅ Location ${rentalId} terminée, vélo ${bikeId} disponible`);
                      connection.release();
                      
                      res.json({
                        success: true,
                        message: "Location terminée avec succès"
                      });
                    });
                  }
                );
              }
            );
          }
        );
      });
    });
    
  } else {
    res.json({
      success: true,
      message: "Location terminée (mode simulation)"
    });
  }
});

// 7. INSCRIPTION
app.post("/api/register", async (req, res) => {
  console.log("📝 Register reçu:", req.body);
  
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ 
        success: false, 
        message: "Email, mot de passe et nom requis" 
      });
    }

    if (!isDbConnected) {
      const token = jwt.sign(
        { userId: 999, email: email, name: name },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      
      return res.json({
        success: true,
        message: "Mode simulation - Compte créé",
        token,
        user: { id: 999, email, name, phone: phone || null }
      });
    }

    // Vérifier email
    db.query(
      "SELECT id FROM users WHERE email = ?",
      [email],
      async (err, results) => {
        if (err) {
          console.error("❌ Erreur vérification email:", err);
          return res.status(500).json({ 
            success: false, 
            message: "Erreur base de données" 
          });
        }

        if (results.length > 0) {
          return res.status(409).json({ 
            success: false, 
            message: "Cet email est déjà utilisé" 
          });
        }

        // Hasher mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Créer utilisateur
        db.query(
          "INSERT INTO users (email, password, name, phone) VALUES (?, ?, ?, ?)",
          [email, hashedPassword, name, phone || null],
          (err, result) => {
            if (err) {
              console.error("❌ Erreur création:", err);
              return res.status(500).json({ 
                success: false, 
                message: "Erreur création compte" 
              });
            }

            // Générer token
            const token = jwt.sign(
              { userId: result.insertId, email: email, name: name },
              JWT_SECRET,
              { expiresIn: "7d" }
            );

            res.json({
              success: true,
              message: "Compte créé avec succès",
              token,
              user: {
                id: result.insertId,
                email,
                name,
                phone: phone || null
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("❌ Erreur inscription:", error);
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur" 
    });
  }
});

// 8. CONNEXION
app.post("/api/login", async (req, res) => {
  console.log("🔐 Login reçu:", req.body.email);
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email et mot de passe requis" 
      });
    }

    if (!isDbConnected) {
      const token = jwt.sign(
        { userId: 999, email: email, name: "Utilisateur Test" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      
      return res.json({
        success: true,
        message: "Mode simulation - Connecté",
        token,
        user: { id: 999, email, name: "Utilisateur Test" }
      });
    }

    db.query(
      "SELECT id, email, password, name, phone FROM users WHERE email = ?",
      [email],
      async (err, results) => {
        if (err) {
          console.error("❌ Erreur login:", err);
          return res.status(500).json({ 
            success: false, 
            message: "Erreur base de données" 
          });
        }

        if (results.length === 0) {
          return res.status(401).json({ 
            success: false, 
            message: "Email ou mot de passe incorrect" 
          });
        }

        const user = results[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
          return res.status(401).json({ 
            success: false, 
            message: "Email ou mot de passe incorrect" 
          });
        }

        const token = jwt.sign(
          { userId: user.id, email: user.email, name: user.name },
          JWT_SECRET,
          { expiresIn: "7d" }
        );

        res.json({
          success: true,
          message: "Connexion réussie",
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone || null
          }
        });
      }
    );
  } catch (error) {
    console.error("❌ Erreur login:", error);
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur" 
    });
  }
});

// 9. PROFIL UTILISATEUR
app.get("/api/profile", authenticateToken, (req, res) => {
  const userId = req.user.userId;

  if (!isDbConnected) {
    return res.json({
      id: userId,
      email: req.user.email,
      name: req.user.name || "Utilisateur",
      phone: "+212 6 XX XX XX XX"
    });
  }

  db.query(
    "SELECT id, email, name, phone FROM users WHERE id = ?",
    [userId],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Utilisateur non trouvé" 
        });
      }
      res.json(results[0]);
    }
  );
});

// ==================== FONCTIONS UTILITAIRES ====================
function rollbackAndRelease(connection, message) {
  connection.rollback(() => {
    connection.release();
    console.error("❌ Transaction annulée:", message);
  });
}

function sendFallbackStations(res) {
  const stations = [
    {
      id: 1,
      name: "ST-WS100",
      latitude: 33.5731,
      longitude: -7.5898,
      address: "Centre-ville Casablanca",
      capacity: 20
    },
    {
      id: 2,
      name: "ST-WS200",
      latitude: 33.5790,
      longitude: -7.5990,
      address: "Quartier des affaires",
      capacity: 15
    },
    {
      id: 3,
      name: "ST-WS300",
      latitude: 33.5670,
      longitude: -7.5800,
      address: "Port de Casablanca",
      capacity: 25
    },
    {
      id: 4,
      name: "ST-WS400",
      latitude: 33.5830,
      longitude: -7.5750,
      address: "Nord Casablanca",
      capacity: 18
    },
    {
      id: 5,
      name: "ST-WS500",
      latitude: 33.581571,
      longitude: -7.602317,
      address: "Nouvelle zone Casablanca",
      capacity: 12
    },
    {
      id: 6,
      name: "ST-WS600",
      latitude: 33.601790,
      longitude: -7.584101,
      address: "Quartier résidentiel Nord",
      qapacity: 10
    }
  ];
  
  res.json(stations);
}

function sendFallbackBikes(stationId, res) {
  const bikesDatabase = {
    1: [
      { id: 101, name: "V100-01", battery: 100, price: 6.00, available: true, station_name: "ST-WS100" },
      { id: 102, name: "V100-02", battery: 90, price: 6.00, available: true, station_name: "ST-WS100" },
      { id: 103, name: "V100-03", battery: 80, price: 6.00, available: true, station_name: "ST-WS100" },
      { id: 104, name: "V100-04", battery: 75, price: 6.00, available: true, station_name: "ST-WS100" }
    ],
    2: [
      { id: 201, name: "V200-01", battery: 100, price: 6.00, available: true, station_name: "ST-WS200" },
      { id: 202, name: "V200-02", battery: 50, price: 6.00, available: true, station_name: "ST-WS200" },
      { id: 203, name: "V200-03", battery: 45, price: 6.00, available: false, station_name: "ST-WS200" }
    ],
    3: [
      { id: 301, name: "V300-01", battery: 100, price: 6.00, available: true, station_name: "ST-WS300" },
      { id: 302, name: "V300-02", battery: 95, price: 6.00, available: true, station_name: "ST-WS300" },
      { id: 303, name: "V300-03", battery: 80, price: 6.00, available: true, station_name: "ST-WS300" },
      { id: 304, name: "V300-04", battery: 70, price: 6.00, available: true, station_name: "ST-WS300" },
      { id: 305, name: "V300-05", battery: 50, price: 5.50, available: true, station_name: "ST-WS300" }
    ],
    4: [
      { id: 401, name: "V400-01", battery: 100, price: 6.00, available: true, station_name: "ST-WS400" },
      { id: 402, name: "V400-02", battery: 90, price: 6.00, available: true, station_name: "ST-WS400" },
      { id: 403, name: "V400-03", battery: 30, price: 5.00, available: true, station_name: "ST-WS400" }
    ],
    5: [
      { id: 501, name: "V500-01", battery: 100, price: 6.00, available: true, station_name: "ST-WS500" },
      { id: 502, name: "V500-02", battery: 65, price: 6.00, available: false, station_name: "ST-WS500" }
    ],
    6: [
      { id: 601, name: "V600-01", battery: 100, price: 6.00, available: true, station_name: "ST-WS600" },
      { id: 602, name: "V600-02", battery: 85, price: 6.00, available: true, station_name: "ST-WS600" },
      { id: 603, name: "V600-03", battery: 95, price: 6.00, available: true, station_name: "ST-WS600" }
    ]
  };
  
  res.json(bikesDatabase[stationId] || []);
}

// ==================== DÉMARRAGE SERVEUR ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Serveur backend démarré`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🌐 Réseau: http://${SERVER_IP}:${PORT}`);
  console.log(`📱 Pour Expo Go: http://${SERVER_IP}:${PORT}`);
  console.log(`📊 MySQL: ${isDbConnected ? '✅ Connecté' : '❌ Non connecté'}`);
  
  console.log(`\n📡 Endpoints disponibles:`);
  console.log(`   http://${SERVER_IP}:${PORT}/`);
  console.log(`   http://${SERVER_IP}:${PORT}/api/register`);
  console.log(`   http://${SERVER_IP}:${PORT}/api/login`);
  console.log(`   http://${SERVER_IP}:${PORT}/api/stations`);
  console.log(`   http://${SERVER_IP}:${PORT}/api/bikes/1`);
  console.log(`   http://${SERVER_IP}:${PORT}/api/my-rentals/1`);
  console.log(`\n💡 Nouveau: Système de locations complet !`);
});