/**
 * Preview translations for the homepage "Your language" scene.
 * Only these three sample explanations are translated: the rest of the app
 * (including report results) is in English. Translations should be reviewed
 * by native speakers before wider use.
 */
export type LangCode = "en" | "hi" | "mr" | "gu" | "bn" | "ta" | "te" | "kn";

export interface LangPack {
  code: LangCode;
  native: string;
  english: string;
  glyph: string;
  items: [{ name: string; text: string }, { name: string; text: string }, { name: string; text: string }];
}

export const LANGUAGES: LangPack[] = [
  { code: "en", native: "English", english: "English", glyph: "A", items: [
    { name: "Hemoglobin", text: "Your body's oxygen delivery team." },
    { name: "White blood cells", text: "Your body's defence team." },
    { name: "Platelets", text: "Your body's tiny repair helpers." },
  ] },
  { code: "hi", native: "हिन्दी", english: "Hindi", glyph: "अ", items: [
    { name: "हीमोग्लोबिन", text: "आपके शरीर की ऑक्सीजन पहुँचाने वाली टीम।" },
    { name: "श्वेत रक्त कोशिकाएँ", text: "आपके शरीर की रक्षा करने वाली टीम।" },
    { name: "प्लेटलेट्स", text: "आपके शरीर के छोटे मरम्मत सहायक।" },
  ] },
  { code: "mr", native: "मराठी", english: "Marathi", glyph: "म", items: [
    { name: "हिमोग्लोबिन", text: "तुमच्या शरीराला ऑक्सिजन पोहोचवणारी टीम." },
    { name: "पांढऱ्या रक्तपेशी", text: "तुमच्या शरीराचे संरक्षण करणारी टीम." },
    { name: "प्लेटलेट्स", text: "तुमच्या शरीराचे छोटे दुरुस्ती मदतनीस." },
  ] },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati", glyph: "ગ", items: [
    { name: "હિમોગ્લોબિન", text: "તમારા શરીરની ઓક્સિજન પહોંચાડનારી ટીમ." },
    { name: "શ્વેત રક્તકણો", text: "તમારા શરીરની રક્ષા કરનારી ટીમ." },
    { name: "પ્લેટલેટ્સ", text: "તમારા શરીરના નાના સમારકામ મદદગારો." },
  ] },
  { code: "bn", native: "বাংলা", english: "Bengali", glyph: "অ", items: [
    { name: "হিমোগ্লোবিন", text: "আপনার শরীরের অক্সিজেন পৌঁছে দেওয়ার দল।" },
    { name: "শ্বেত রক্তকণিকা", text: "আপনার শরীরের প্রতিরক্ষা দল।" },
    { name: "প্লেটলেট", text: "আপনার শরীরের ছোট্ট মেরামতকারী সহায়ক।" },
  ] },
  { code: "ta", native: "தமிழ்", english: "Tamil", glyph: "அ", items: [
    { name: "ஹீமோகுளோபின்", text: "உங்கள் உடலுக்கு ஆக்சிஜன் கொண்டு செல்லும் குழு." },
    { name: "வெள்ளை இரத்த அணுக்கள்", text: "உங்கள் உடலைப் பாதுகாக்கும் குழு." },
    { name: "தட்டணுக்கள்", text: "உங்கள் உடலின் சிறிய பழுதுபார்க்கும் உதவியாளர்கள்." },
  ] },
  { code: "te", native: "తెలుగు", english: "Telugu", glyph: "అ", items: [
    { name: "హిమోగ్లోబిన్", text: "మీ శరీరానికి ఆక్సిజన్ అందించే బృందం." },
    { name: "తెల్ల రక్త కణాలు", text: "మీ శరీరాన్ని రక్షించే బృందం." },
    { name: "ప్లేట్‌లెట్లు", text: "మీ శరీరంలోని చిన్న మరమ్మతు సహాయకులు." },
  ] },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada", glyph: "ಅ", items: [
    { name: "ಹಿಮೋಗ್ಲೋಬಿನ್", text: "ನಿಮ್ಮ ದೇಹಕ್ಕೆ ಆಮ್ಲಜನಕ ತಲುಪಿಸುವ ತಂಡ." },
    { name: "ಬಿಳಿ ರಕ್ತ ಕಣಗಳು", text: "ನಿಮ್ಮ ದೇಹವನ್ನು ರಕ್ಷಿಸುವ ತಂಡ." },
    { name: "ಪ್ಲೇಟ್‌ಲೆಟ್‌ಗಳು", text: "ನಿಮ್ಮ ದೇಹದ ಸಣ್ಣ ದುರಸ್ತಿ ಸಹಾಯಕರು." },
  ] },
];

export const langPack = (code: LangCode) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
