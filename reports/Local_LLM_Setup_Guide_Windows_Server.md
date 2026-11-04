# 📋 Complete End-to-End Guide: Qwen 7B Setup on Windows Server
### ASA Bangladesh — Database Operations Team (DBA-TEST)

---

## 📌 Target Architecture

* **Server:** `DBA-TEST.asabd.org` (Windows Server 2022, 64 GB RAM, 8 vCPUs)
* **AI Engine:** Ollama for Windows (Open-Source, Local inference)
* **Model Storage Location:** `D:\_IMU\ollama_models` (Separated, keeping D:\ clean)
* **Selected Model:** `qwen2.5-coder:7b` (Optimized for SQL tuning & DBA tasks)
* **Data Security:** 100% On-Premise, Zero Data Leaves ASA, No Live DB Connection

---

## 🛠️ Step-by-Step Execution Checklist

### Phase 1: Clean & Set Dedicated Storage Folder

Run this block in **PowerShell (Run as Administrator)**:

```powershell
# 1. Stop any background Ollama processes
Stop-Process -Name "ollama", "ollama app" -Force -ErrorAction SilentlyContinue

# 2. Clean up temporary files from previous attempts
Remove-Item -Recurse -Force "D:\_IMU\blobs", "D:\_IMU\manifests", "D:\_IMU\manifests-v2" -ErrorAction SilentlyContinue

# 3. Create your dedicated separate model directory
New-Item -ItemType Directory -Force -Path "D:\_IMU\ollama_models"

# 4. Set the permanent system environment variable
[System.Environment]::SetEnvironmentVariable('OLLAMA_MODELS', 'D:\_IMU\ollama_models', 'Machine')

# 5. Apply variable to current active session
$env:OLLAMA_MODELS = "D:\_IMU\ollama_models"
```

---

### Phase 2: Download & Run Qwen 7B

In the **same PowerShell window**, execute:

```powershell
ollama run qwen2.5-coder:7b
```

#### What Happens:
1. Ollama connects and pulls `qwen2.5-coder:7b` (~4.7 GB).
2. All downloaded model files and blobs are saved exclusively into `D:\_IMU\ollama_models`.
3. Once completed (100%), you will see the interactive prompt:
   ```text
   >>> Send a message (/? for help)
   ```

---

### Phase 3: Verify & Impress Management (Live DBA Test Queries)

Once the `>>>` prompt appears, test with these real-world database scenarios:

#### Test Scenario 1: Indexing & Query Optimization
Paste this into the prompt:
```text
I am a DBA at an MFI organization. We have a table "LoanRepayments" with 20 million rows.
The query below is running slow and causing high CPU:

SELECT MemberID, LoanAccountNo, AmountPaid, PaymentDate
FROM LoanRepayments
WHERE BranchCode = 'BR-014' AND PaymentStatus = 'CONFIRMED'
ORDER BY PaymentDate DESC;

Suggest the optimal composite index, explain the column ordering rationale, and check if any INCLUDE columns are needed.
```

#### Test Scenario 2: Stored Procedure & Lock Contention
Paste this into the prompt:
```text
Explain how to prevent deadlocks and lock escalation in SQL Server when updating 50,000 member records in a batch job. Provide sample T-SQL batching code with ROWCOUNT/TOP.
```

---

### Phase 4: Useful Daily Commands

| Task | Command |
|---|---|
| Exit the prompt | Type `/bye` or press `Ctrl + D` |
| View all installed models | `ollama list` |
| Check memory/running status | `ollama ps` |
| Start Qwen anytime | `ollama run qwen2.5-coder:7b` |
| Remove an old model | `ollama rm <model-name>` |

---

### Phase 5: Enable Access from ASA Internal Network (Optional)

If you want your development PC or the Wails **Execution Plan Visualizer** app to connect to this server:

1. Allow Ollama to listen on all network interfaces:
   ```powershell
   [System.Environment]::SetEnvironmentVariable('OLLAMA_HOST', '0.0.0.0:11434', 'Machine')
   ```
2. Open Firewall Port 11434:
   ```powershell
   New-NetFirewallRule -DisplayName "Ollama AI API" -Direction Inbound -LocalPort 11434 -Protocol TCP -Action Allow
   ```
3. Restart Ollama. Any internal machine can now send API requests to:
   ```
   http://192.168.250.78:11434/api/generate
   ```
