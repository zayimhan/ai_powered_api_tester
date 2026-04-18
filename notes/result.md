# AIFlow — Eski Sistem vs Smart Run (LangGraph) Karşılaştırması

## Eski Sistem: Deterministik Run

### Nasıl Çalışır?
1. **Planlama (CrewAI):** Kullanıcı doğal dil komutu girer ("UserA ve UserB kaydol, arkadaş isteği gönder..."). CrewAI bu komutu analiz edip hangi API endpoint'lerinin hangi sırayla çalıştırılacağını bir plan olarak üretir.
2. **Çalıştırma (Node.js):** Plan adım adım execute edilir. Her adım için kaydedilmiş request alınır, `{{token}}`, `{{userId}}` gibi template değişkenleri context'ten doldurulur ve HTTP isteği axios ile gönderilir.
3. **Assertion:** Her adım için tanımlı assertion'lar (status code, body contains, vb.) kontrol edilir.
4. **Sonuç:** Tüm adımlar çalıştırılır, passed/failed olarak raporlanır. Bir adım başarısız olursa sistem devam eder ama hiçbir şey yapmaz.

### Sınırlaması
- Bir adım başarısız olduğunda sistem **körce devam eder**.
- Neden başarısız olduğunu anlamaz, düzeltmeye çalışmaz.
- Eksik header, yanlış body field gibi düzeltilebilir hatalar bile elle müdahale gerektirir.

---

## Yeni Sistem: Smart Run (LangGraph Self-Healing)

### Ne Eklendi?
Python tabanlı bir **LangGraph** servisi (port 8001) eklendi. Bu servis aynı senaryo planını alır ama her adımı çok daha akıllı bir şekilde işler.

### Nasıl Çalışır?

Her adım için 4 node içeren bir graph döngüsü çalışır:

```
prepare_step → executor → evaluator → [passed: sonraki adım]
                                    ↘ [failed: healer → prepare_step (retry)]
```

#### 1. `prepare_step`
- Adımın saved request'ini alır.
- `{{UserA_token}}`, `{{UserB_id}}` gibi template değişkenlerini context'ten çözer.
- Email/username'leri run başına unique yapar (çakışma önlemek için).
- Actor-specific token injection yapar (UserA kendi tokenı, UserB kendi tokenı ile istek atar).

#### 2. `executor`
- HTTP isteğini `httpx` ile gönderir (Python).

#### 3. `evaluator`
- Assertion'ları deterministik olarak kontrol eder (status code, body içeriği vb.).
- **Başarısız olursa:** GPT-4o-mini'ye sorar: "Bu hata düzeltilebilir mi? Eksik header mi var, yanlış body field mi?"
- LLM `should_heal=True` dönerse healer devreye girer.

#### 4. `healer`
- GPT-4o-mini minimal değişiklikler önerir (yeni header, body field düzeltmesi).
- Adım yeniden hazırlanır ve tekrar çalıştırılır.
- **Maksimum 2 heal denemesi** yapılır, sonra başarısız olarak işaretlenir.

### Context Yönetimi
Her adımın response'undan otomatik değişkenler çıkarılır:
- `token`, `id`, `userId`, `access_token` gibi alanlar otomatik yakalanır.
- Actor-specific değişkenler: `UserA_token`, `UserB_id`, `UserA_created_id` vb.
- Sonraki adımlar bu değişkenleri `{{UserA_token}}` şeklinde kullanır.

---

## Örnek Senaryo Sonuçları

**Komut:** "Register two new users (UserA and UserB), login with credentials for each user. UserA sends a friend request to UserB. Check UserB's friend list — UserA should NOT be in the list yet. UserB accepts the friend request from UserA. Check UserB's friend list again — UserA should now be in the list."

| Adım | Açıklama | Deterministik Run | Smart Run |
|------|----------|:-----------------:|:---------:|
| 1 | UserA register | ✅ 201 | ✅ 201 |
| 2 | UserA login | ✅ 200 | ✅ 200 |
| 3 | UserB register | ✅ 201 | ✅ 201 |
| 4 | UserB login | ✅ 200 | ✅ 200 |
| 5 | UserA → arkadaş isteği gönder | ✅ 201 | ✅ 201 |
| 6 | UserB arkadaş listesi (UserA YOK) | ✅ 200 | ✅ 200 |
| 7 | UserB → isteği kabul et | ✅ 200 | ✅ 200 |
| 8 | UserB arkadaş listesi (UserA VAR) | ✅ 200 | ✅ 200 |

**Sonuç: 8/8 passed** — Her iki sistem de geçti. Fark, bir adım başarısız olduğunda ortaya çıkar: Deterministik run olduğu gibi devam eder, Smart Run düzeltmeye çalışır.

---

## Teknik Mimari

```
Frontend (Angular)
    │
    ▼
Node.js Backend (port 3000)
    ├── /api/scenarios/run        → Deterministik Run (JS, axios)
    └── /api/scenarios/run-graph  → Smart Run
              │
              ▼
         LangGraph Service (Python, port 8001)
              ├── prepare_step  (template resolution, uniquification)
              ├── executor      (httpx HTTP requests)
              ├── evaluator     (assertions + GPT-4o-mini değerlendirme)
              └── healer        (GPT-4o-mini self-healing)
```

## Kullanılan Teknolojiler
- **LangGraph** (langgraph-py): Graph tabanlı agent orchestration
- **GPT-4o-mini**: Evaluator ve Healer LLM
- **httpx**: Async HTTP client (Python)
- **FastAPI**: LangGraph servis API'si
- **SQLite**: LangGraph checkpoint storage (thread resume için)
