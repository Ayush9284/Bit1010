const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
const PORT = 5000;

// Middleware
app.use(cors()); // Enable CORS for frontend-backend communication
app.use(express.json()); // Parse JSON request bodies


const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Create the uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer configuration for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Save files in the 'uploads' folder
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + file.originalname); // Unique filename
    },
});

const upload = multer({ storage });

async function getPageCount(filePath) {
    const fileData = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(fileData);
    return pdfDoc.getPageCount();
}

// Endpoint to handle file uploads
app.post('/upload', upload.array('pdfFiles'), async (req, res) => {
    const files = req.files;
    const printType = req.body.printType;
    const pageSize = req.body.pageSize;
    const sidePrint = req.body.sidePrint;

    if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }

    // Log the uploaded file names to a text file
    const logFilePath = path.join(__dirname, 'pdf_log.txt');
    const timestamp = new Date().toISOString();

    try {
        // Create a log entry for each file with additional parameters
        let logData = '';
        for (const file of files) {
            const filePath = path.join(uploadDir, file.filename);
            const pageCount = await getPageCount(filePath); // Get the page count

            logData += `Timestamp: ${timestamp}\nFilename: ${file.filename}\nPage Count: ${pageCount}\nPrint Type: ${printType}\nPage Size: ${pageSize}\nPrint Sides: ${sidePrint}\n\n`;
        }

        // Append log data after the loop
        fs.appendFile(logFilePath, logData, (err) => {
            if (err) {
                console.error('Error writing to log file:', err);
                return res.status(500).json({ success: false, message: 'Failed to log file names.' });
            }

            console.log('Files uploaded and logged successfully:', files.map(file => file.filename));

            // Send success response to the frontend
            res.json({
                success: true,
                message: 'Files uploaded successfully!',
                files: files.map(file => file.filename),
                printOptions: { printType, pageSize, sidePrint },
            });
        });
    } catch (error) {
        console.error('Error processing PDFs:', error);
        return res.status(500).json({ success: false, message: 'Error processing PDF files.' });
    }
});

// Serve static files (for frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Chatbot endpoint
app.post("/chat", async (req, res) => {
    const { message } = req.body;
  
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
  
    try {
      // Generate a response using the Google Generative AI model
      const result = await model.generateContent(message);
      const response = await result.response.text();
  
      // Send the response back to the frontend
      res.json({ response });
    } catch (error) {
      console.error("Error generating response:", error);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
