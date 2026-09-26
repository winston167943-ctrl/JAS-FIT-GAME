# JAS FIT GAME — מסמך תכנון ופרומט-על

> משחק Web תלת-ממדי בסגנון פיקסאר, בכיכובה של הדמות המצוירת של יסמין (JAS Fitness).
> מטרה עסקית: כלי שיווקי שמביא משתמשים לאפליקציית JAS Fitness ומחזק את המותג.

---

## 1. חזון במשפט אחד

**"יום בחיים של יסמין"**: סימולציית לייף-סטייל קלילה ומהנה שבה מנהלים את היום של יסמין. היא מתאמנת, רצה, אוכלת, שותה ונוסעת בשכונה צבעונית, והכל עובר דרך טלפון שעובד בתוך המשחק. כל הדרכים במשחק מובילות בסוף לאפליקציה האמיתית.

## 2. עקרונות מנחים (החלטות מקצועיות)

| עיקרון | למה |
|---|---|
| **גרסה ראשונה קטנה ומלוטשת** | עדיף עולם אחד קטן שמרגיש מטורף על פני עולם ענק וחצי-גמור |
| **סגנון מצויר, לא ריאליסטי** | זה מה שנראה הכי טוב בדפדפן, וזה גם הסגנון של המותג |
| **בנייה לפי תקציב מובייל והגדלה בדסקטופ** | הדרך היחידה להגיע לרמה טובה בשתי הפלטפורמות: 3 רמות איכות עם זיהוי אוטומטי |
| **כל מכניקה משרתת את המותג** | מדדים, אימונים ותזונה משקפים את מה שהאפליקציה מלמדת |
| **Share-first** | מצב סלפי ושיתוף מובנים, כי ויראליות היא מנוע השיווק |

## 3. Core Loop

```
בוקר בבית ──► אוכל / מים ──► נסיעה או ריצה ──► חדר כושר (מיני-משחק)
     ▲                                                   │
     └──── שינה (שמירה + סיכום יום) ◄── ערב: טלפון / חברים ◄┘
```

**מדדים** (0–100, יורדים עם הזמן ומושפעים מפעולות):
- ⚡ אנרגיה: יורדת באימון, עולה בשינה ובאוכל
- 🍎 רעב/תזונה: ארוחות מאוזנות נותנות בונוס
- 💧 הידרציה: מים לפני אימון משפרים ביצועים
- 💪 כושר (כוח / סיבולת): XP שעולה באימונים ופותח תרגילים חדשים
- 😊 מצב רוח: מושפע מאיזון כללי, חברים ומוזיקה

**שעון יום/לילה**: יום משחק ≈ 12–15 דקות אמיתיות, עם תאורה דינמית.

## 4. העולם — "JAS Neighborhood"

שכונה קומפקטית אחת, בסגנון דיורמה (diorama):
1. **הבית של יסמין**: מטבח (אוכל), סלון, חדר שינה (שינה ושמירה), מראה (ארון בגדים)
2. **חדר כושר**: עמדת משקולות, סקוואט, חבל התנגדות (כמו בסרטון), מאמן NPC
3. **פארק ומסלול ריצה**: ריצה ובקבוקי מים
4. **כבישים**: לולאה שמחברת בין כל המקומות, עם תנועה קלה
5. **בית קפה / שוק בריא**: קניית מצרכים, NPCs

## 5. מיני-משחקים (גרסה ראשונה)

| מיני-משחק | מכניקה | תחושה |
|---|---|---|
| **הרמת משקולות** | פס תזמון: לוחצים באזור הירוק, רצף פגיעות = חזרות. טכניקה גרועה = פציעה קלה | מספק, עם מצלמה קרובה, סלואו-מושן בחזרה האחרונה ורעידת מסך עדינה |
| **ריצה** | קצב: הקשה בקצב הצעדים שומרת על סטמינה. אוספים מים ואנרגיה בדרך | מוזיקה ו-flow |
| **חבל התנגדות** | Hold & Release: מחזיקים, משחררים בזמן הנכון ושומרים על מתח | מחווה ישירה לסרטון |
| **נסיעה** | רכב ארקייד (פיזיקה פשוטה), חניה, "fast travel" אחרי הביקור הראשון | חופש |

## 6. הטלפון בתוך המשחק ⭐ (לב השיווק)

שכבת HTML/React מעל הסצנה התלת-ממדית, עם אנימציית הרמה והורדה:
- **JAS Fitness**: מראה ומרגיש כמו האפליקציה האמיתית, עם כפתור **"להורדת האפליקציה האמיתית"** (deep link / store link)
- **מתכונים**: בחירת ארוחה שמשפיעה על המדדים
- **מים**: מעקב שתייה
- **מפה**: ניווט ו-fast travel
- **הודעות**: NPCs שולחים משימות ("בואי לריצה בפארק ב-18:00!")
- **מצלמה / סלפי**: פוזות, פילטרים ושיתוף לאינסטגרם/וואטסאפ עם הלוגו ← **מנוע ויראליות**
- **מוזיקה**: פלייליסט אימון (האוזניות של יסמין!)

## 7. דמויות

- **יסמין**: הגיבורה (מהתמונה שבסרטון)
- NPCs באותו סגנון: מאמן בחדר הכושר, חברה לריצה, בריסטה, שכן עם כלב
- ארון בגדים: תלבושות נפתחות בהישגים (וגם בקודים מהאפליקציה האמיתית)

## 8. אינטגרציה שיווקית

- CTA מדוד להורדת האפליקציה (בלי להציף: בטלפון, בסיכום יום ובהישגים)
- **קודי פתיחה**: אימון באפליקציה האמיתית נותן קוד לתלבושת במשחק
- שיתוף סלפי וסיכום יום עם מיתוג
- אנליטיקס: זמן משחק, מעבר ל-CTA, שיתופים (Plausible / GA4)

## 9. סטאק טכני

| שכבה | בחירה | סיבה |
|---|---|---|
| Build | **Vite + TypeScript** | מהיר, סטנדרטי |
| 3D | **React Three Fiber + drei** | אקו-סיסטם עשיר, UI ו-3D באותה שפה |
| פיזיקה | **@react-three/rapier** | ביצועים טובים ב-WASM, רכב ודמות |
| אפקטים | **@react-three/postprocessing** | Bloom, DOF, SMAA, Tone mapping |
| State | **Zustand** | מדדים, זמן ומשימות, עם persist ל-localStorage |
| UI / טלפון | React + CSS (Framer Motion) | טלפון חלק ואמיתי |
| אודיו | Howler.js | מוזיקה ואפקטים |
| שליטה | מקלדת/עכבר + ג'ויסטיק מגע (nipplejs) | שתי הפלטפורמות |
| נכסים | glTF + Draco + KTX2 (gltf-transform) | קבצים קטנים וטעינה מהירה |
| פריסה | Vercel / GitHub Pages + PWA | התקנה כאפליקציה במובייל |

**תקציבי ביצועים** (חובה):
- מובייל ביניים: 60fps יעד ו-30fps רצפה, פחות מ-150 draw calls, טעינה ראשונית מתחת ל-15MB
- 3 רמות איכות (Low / Medium / High) עם זיהוי אוטומטי והחלפה ידנית
- טעינה עצלה לכל אזור (בית / חדר כושר / פארק)

## 10. צינור יצירת הדמות

1. **תמונת מקור**: יסמין בגוף מלא, חזית, רקע נקי, רזולוציה גבוהה (עדיף ב-A-pose)
2. **תמונה ← מודל 3D** (GLB) בכלי AI
3. **Auto-rig** (Mixamo או כלי מקביל) ← שלד
4. **אנימציות**: idle, הליכה, ריצה, הרמה, אכילה, שתייה, נהיגה, ריקוד, פוזות סלפי
5. **אופטימיזציה**: gltf-transform (Draco, KTX2, פחות מ-30k משולשים)
6. ⚠️ **סיכון ידוע**: השיער המתולתל. ייתכן שיידרש פתרון ייעודי (mesh נפרד או כרטיסי שיער)

## 11. אבני דרך

| שלב | תוצר | הגדרת "גמור" |
|---|---|---|
| **M0: שלד** | פרויקט, דמות זמנית, עולם אפור, שליטה במגע ובמקלדת, מצלמה | הולכים בעולם ב-60fps בטלפון |
| **M1: חיים** | מדדים, שעון יום/לילה, בית (אוכל, מים, שינה), שמירה | יום שלם עובר ומגיב לפעולות |
| **M2: כושר** | חדר כושר ו-2 מיני-משחקים (משקולות וחבל) | אימון מרגיש מספק ומשפיע על המדדים |
| **M3: טלפון** | כל האפליקציות, כולל CTA וסלפי | הטלפון מרגיש אמיתי |
| **M4: עיר** | כבישים, רכב, פארק ומיני-משחק ריצה | נוסעים ורצים בין המקומות |
| **M5: אמנות** | יסמין האמיתית, NPCs, תאורה ואפקטים | "וואו" ראשון |
| **M6: השקה** | ביצועים, אודיו, אנליטיקס, PWA, פריסה | קישור ציבורי מוכן לשיווק |

---

## 12. פרומט-על לבנייה (Master Prompt)

> להדבקה בתחילת כל סשן פיתוח, יחד עם שם אבן הדרך הנוכחית.

```text
You are a senior web game developer and technical artist building "JAS FIT GAME":
a stylized (Pixar-like, chibi) 3D life-sim web game starring Yasmin, the mascot of
the JAS Fitness app. The game is a marketing funnel for the real app.

CORE FANTASY: "A day in Yasmin's life". Manage her energy, nutrition, hydration,
fitness and mood across a compact diorama neighborhood (home, gym, park, roads,
café) with a working in-game smartphone.

STACK (do not deviate without justification): Vite + TypeScript + React,
React Three Fiber + drei, @react-three/rapier, @react-three/postprocessing,
Zustand (persisted), Framer Motion for the phone UI, Howler.js, nipplejs for touch.
Assets: glTF with Draco + KTX2, optimized via gltf-transform.

NON-NEGOTIABLES:
1. Mobile-first performance: 60fps target / 30fps floor on a mid-range phone,
   <150 draw calls, <15MB initial load, lazy-load zones, 3 auto-detected quality tiers.
2. Equal first-class controls: keyboard/mouse AND touch (virtual joystick + buttons).
3. Visual bar: soft warm lighting, ACES tone mapping, subtle bloom, soft shadows,
   juicy feedback (easing, squash & stretch, particles, camera moves, haptics on mobile).
4. The phone is an HTML overlay: apps = JAS Fitness (with real download CTA),
   Recipes, Water, Map/fast-travel, Messages (NPC quests), Camera/Selfie (share),
   Music.
5. Clean architecture: /src/world, /src/player, /src/systems (stats, time, quests,
   save), /src/minigames, /src/phone, /src/ui, /src/assets. Typed game state in
   Zustand. No god components. Every system testable in isolation.
6. Placeholder-first: build with primitive/placeholder characters behind a
   Character interface so the real rigged GLB can be dropped in without refactors.
7. UI language: Hebrew (RTL) first, with i18n ready for English.

WORKING STYLE: Deliver one milestone at a time from docs/GAME_PLAN.md. For each:
state the plan, implement, run it, verify on a mobile viewport, report what works,
what doesn't, and the next step. Be honest about trade-offs; push back on scope
that threatens quality.

CURRENT MILESTONE: <M0 | M1 | ...>
```
