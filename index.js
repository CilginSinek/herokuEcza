require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");

const url = "https://eskisehireo.org.tr/ilanlar";

// MongoDB bağlantısı
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Mongoose ilan şeması ve modeli
const ilanSchema = new mongoose.Schema({
  title: String,
  date: String,
  category: String,
  contact: String,
  description: String
});
const Ilan = mongoose.model("Ilan", ilanSchema);

console.log(process.env.MAIL_HOST, process.env.MAIL_PORT, process.env.MAIL_USER, process.env.MAIL_PASS);

// Mail ayarları
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: process.env.MAIL_SECURE === "true",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

async function ilanlariCekVeKontrolEt() {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const ilanlar = [];
    $(".tz-infomation").each((i, el) => {
      const container = $(el);
      const title = container.find(".tz-post-title").text().trim();
      const span = container.find("span").first();
      const textNodes = span.contents().filter(function() {
        return this.type === "text" && $(this).text().trim() !== "";
      }).map(function() {
        return $(this).text().trim();
      }).get();
      const date = textNodes[0] || "";
      const category = textNodes[1] || "";
      const contact = textNodes[2] || "";
      const description = container.find("p").text().trim();

      ilanlar.push({
        title,
        date,
        category,
        contact,
        description
      });
    });

    // Eski ilanları MongoDB'den çek
    const eskiIlanlar = await Ilan.find({}).lean();

    // Farklı ilanları bul
    const yeniIlanlar = ilanlar.filter(
      yeni => !eskiIlanlar.some(eski =>
        eski.title === yeni.title &&
        eski.date === yeni.date &&
        eski.category === yeni.category &&
        eski.contact === yeni.contact &&
        eski.description === yeni.description
      )
    );

    if (yeniIlanlar.length > 0) {
      // Mail gönder
      const mailOptions = {
        from: `"İlan Takip" <${process.env.MAIL_USER}>`,
        to: process.env.MAIL_TO,
        subject: "Yeni İlan(lar) Yayınlandı",
        text: yeniIlanlar.map(i => 
          `Başlık: ${i.title}\nTarih: ${i.date}\nKategori: ${i.category}\nİletişim: ${i.contact}\nAçıklama: ${i.description}\n---`
        ).join("\n"),
      };

      transporter.sendMail(mailOptions, async (error, info) => {
        if (error) {
          return console.error("Mail gönderilemedi:", error);
        }
        console.log("Mail gönderildi:", info.response);
        await Ilan.insertMany(yeniIlanlar);
        console.log("Yeni ilanlar MongoDB'ye kaydedildi.");
      });
    } else {
      console.log("Yeni ilan yok, MongoDB güncellenmedi.");
    }
  } catch (error) {
    console.error("Hata oluştu:", error);
  }
}

module.exports = { ilanlariCekVeKontrolEt };
