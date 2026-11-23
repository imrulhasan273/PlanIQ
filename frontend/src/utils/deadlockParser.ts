import {
  DeadlockGraph,
  DeadlockProcess,
  DeadlockResource,
  DeadlockStackFrame,
  DeadlockCycleStep,
  ResourceLockHolder,
  DeadlockTimelineEvent,
} from '../types/deadlock';

/**
 * Decodes a File or Blob into a clean UTF-8 string, auto-detecting UTF-16 LE/BE,
 * UTF-8 with BOM, and UTF-16 LE without BOM (typical of SSMS .xdl and .sqlplan files).
 */
export async function readFileAsDecodedText(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.slice(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x00) {
    // UTF-16 LE without BOM ('<' followed by 0x00)
    return new TextDecoder('utf-16le').decode(buf);
  }
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * Normalizes raw deadlock XML text: removes BOMs, strips null bytes, unescapes
 * Extended Events entities, and strips XML declarations to prevent DOMParser errors.
 */
export function cleanDeadlockRawText(rawText: string): string {
  if (!rawText) return '';
  let clean = rawText.trim();
  // Strip BOM if present
  if (clean.charCodeAt(0) === 0xfeff || clean.charCodeAt(0) === 0xfffe) {
    clean = clean.slice(1).trim();
  }
  // Strip null bytes (from UTF-16 strings misread as single-byte)
  clean = clean.replace(/\0/g, '');

  // If the content is XML entity encoded (e.g. SQL Server Extended Events system_health target), unescape it
  if (
    clean.includes('&lt;deadlock') ||
    clean.includes('&lt;victim-list') ||
    clean.includes('&lt;process-list')
  ) {
    clean = clean
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // Strip <?xml ... ?> declarations (DOMParser errors if encoding="utf-16" is specified on JS string)
  clean = clean.replace(/<\?xml[^>]*\?>/gi, '').trim();

  return clean;
}

/**
 * Check if the raw XML text is a SQL Server Deadlock Report (.xdl or .xml)
 */
export function isDeadlockXML(xmlText: string, fileName?: string): boolean {
  if (fileName && fileName.toLowerCase().endsWith('.xdl')) return true;
  if (!xmlText) return false;
  const lower = xmlText.replace(/\0/g, '').toLowerCase();
  return (
    lower.includes('<deadlock') ||
    lower.includes('&lt;deadlock') ||
    lower.includes('<victim-list') ||
    lower.includes('&lt;victim-list') ||
    lower.includes('<process-list') ||
    lower.includes('&lt;process-list') ||
    lower.includes('xml_deadlock_report') ||
    lower.includes('deadlock-list')
  );
}

/**
 * Parses raw .xdl or deadlock XML content into structured DeadlockGraph objects.
 */
export function parseDeadlockXML(rawXml: string): DeadlockGraph[] {
  if (!rawXml) {
    throw new Error('Deadlock file is empty.');
  }

  const cleanXml = cleanDeadlockRawText(rawXml);
  const parser = new DOMParser();
  let doc = parser.parseFromString(cleanXml, 'application/xml');

  let parserError = doc.querySelector('parsererror');
  if (parserError) {
    // Attempt fallback parsing with text/html in case of stray namespace prefixes
    try {
      const htmlDoc = parser.parseFromString(cleanXml, 'text/html');
      const testNodes = htmlDoc.querySelectorAll('deadlock, victim-list, process-list');
      if (testNodes.length > 0) {
        doc = htmlDoc as unknown as Document;
        parserError = null;
      }
    } catch {
      // ignore fallback error
    }

    if (parserError) {
      throw new Error(`XML Parse Error: ${parserError.textContent?.slice(0, 250)}`);
    }
  }

  // Find all <deadlock> nodes recursively (case-insensitive & namespace-tolerant)
  let deadlockNodes: Element[] = [];
  const walk = (elem: Element) => {
    const name = (elem.localName || elem.tagName || '').toLowerCase();
    if (name === 'deadlock') {
      deadlockNodes.push(elem);
      return;
    }
    for (let i = 0; i < elem.children.length; i++) {
      walk(elem.children[i]);
    }
  };
  if (doc.documentElement) {
    walk(doc.documentElement);
  }

  // Fallback: check if root or parent of victim-list / process-list represents the deadlock container
  if (deadlockNodes.length === 0 && doc.documentElement) {
    const rootName = (doc.documentElement.localName || doc.documentElement.tagName || '').toLowerCase();
    if (rootName.includes('deadlock')) {
      deadlockNodes = [doc.documentElement];
    } else {
      const victimList = doc.querySelector('victim-list, [local-name()="victim-list"]');
      const processList = doc.querySelector('process-list, [local-name()="process-list"]');
      if (victimList && victimList.parentElement) {
        deadlockNodes = [victimList.parentElement];
      } else if (processList && processList.parentElement) {
        deadlockNodes = [processList.parentElement];
      }
    }
  }

  if (deadlockNodes.length === 0) {
    throw new Error('No <deadlock> element or process-list found in the provided XML/XDL content.');
  }

  return deadlockNodes.map((dlNode, idx) => parseSingleDeadlock(dlNode, idx, cleanXml));
}

function parseSingleDeadlock(dlNode: Element, index: number, rawXml: string): DeadlockGraph {
  // Helper to find child elements case-insensitively
  const findChildByLocalName = (parent: Element, targetName: string): Element | undefined => {
    const t = targetName.toLowerCase();
    return Array.from(parent.children).find(
      (c) => (c.localName || c.tagName || '').toLowerCase() === t
    );
  };

  const findChildrenByLocalName = (parent: Element, targetName: string): Element[] => {
    const t = targetName.toLowerCase();
    return Array.from(parent.children).filter(
      (c) => (c.localName || c.tagName || '').toLowerCase() === t
    );
  };

  // 1. Victims
  const victimList = findChildByLocalName(dlNode, 'victim-list') || dlNode.getElementsByTagName('victim-list')[0];
  const victimIds: string[] = [];
  if (victimList) {
    const victims = Array.from(victimList.getElementsByTagName('victimProcess'));
    victims.forEach((v) => {
      const id = v.getAttribute('id') || v.getAttribute('id');
      if (id) victimIds.push(id);
    });
  }

  // 2. Process List
  const processList = dlNode.getElementsByTagName('process-list')[0];
  const processes: DeadlockProcess[] = [];
  if (processList) {
    const procElements = Array.from(processList.getElementsByTagName('process'));
    procElements.forEach((p) => {
      const id = p.getAttribute('id') || `proc_${Math.random()}`;
      const spid = parseInt(p.getAttribute('spid') || '0', 10);
      const ecid = parseInt(p.getAttribute('ecid') || '0', 10);
      const priority = parseInt(p.getAttribute('priority') || '0', 10);
      const waittimeMs = parseInt(p.getAttribute('waittime') || '0', 10);
      const status = p.getAttribute('status') || 'unknown';
      const waitresource = p.getAttribute('waitresource') || '';
      const lockMode = p.getAttribute('lockMode') || '';
      const loginname = p.getAttribute('loginname') || '';
      const hostname = p.getAttribute('hostname') || '';
      const clientapp = p.getAttribute('clientapp') || '';
      const isolationlevel = p.getAttribute('isolationlevel') || '';
      const transactionname = p.getAttribute('transactionname') || '';

      // Input buffer (the active query)
      let inputbuf = '';
      const inputbufNode = p.getElementsByTagName('inputbuf')[0];
      if (inputbufNode) {
        inputbuf = (inputbufNode.textContent || '').trim();
      }

      // Execution stack
      const executionStack: DeadlockStackFrame[] = [];
      const stackNode = p.getElementsByTagName('executionStack')[0];
      if (stackNode) {
        const frames = Array.from(stackNode.getElementsByTagName('frame'));
        frames.forEach((f) => {
          executionStack.push({
            procname: f.getAttribute('procname') || '',
            line: parseInt(f.getAttribute('line') || '0', 10),
            sql: (f.textContent || '').trim(),
          });
        });
      }

      // Deep process attributes
      const logUsedBytes = parseInt(p.getAttribute('logused') || '0', 10);
      const tranCount = parseInt(p.getAttribute('trancount') || '0', 10);
      const lastTranStarted = p.getAttribute('lasttranstarted') || '';
      const lastBatchStarted = p.getAttribute('lastbatchstarted') || '';
      const lastBatchCompleted = p.getAttribute('lastbatchcompleted') || '';
      const xactId = p.getAttribute('xactid') || '';
      const currentDb = p.getAttribute('currentdb') || p.getAttribute('currentdbname') || '';
      const kpid = parseInt(p.getAttribute('kpid') || '0', 10);
      const lockTimeout = p.getAttribute('lockTimeout') || '';
      const isParallelWorker = ecid > 0;

      processes.push({
        id,
        spid,
        ecid,
        status,
        priority,
        waittimeMs,
        waitresource,
        lockMode,
        loginname,
        hostname,
        clientapp,
        isolationlevel,
        transactionname,
        inputbuf,
        isVictim: victimIds.includes(id),
        executionStack,
        logUsedBytes,
        tranCount,
        lastTranStarted,
        lastBatchStarted,
        lastBatchCompleted,
        xactId,
        currentDb,
        kpid,
        lockTimeout,
        isParallelWorker,
      });
    });
  }

  // 3. Resource List
  const resourceList = dlNode.getElementsByTagName('resource-list')[0];
  const resources: DeadlockResource[] = [];
  if (resourceList) {
    const resChildren = Array.from(resourceList.children);
    resChildren.forEach((r, rIdx) => {
      const type = r.localName || r.tagName;
      const id = r.getAttribute('id') || `res_${rIdx}`;
      const database = r.getAttribute('dbid') || r.getAttribute('currentdb') || '';
      const objectname = r.getAttribute('objectname') || '';
      const indexname = r.getAttribute('indexname') || '';
      const mode = r.getAttribute('mode') || '';
      const associatedObjectId = r.getAttribute('associatedObjectId') || r.getAttribute('hobtid') || '';
      const subresource = r.getAttribute('subresource') || '';
      const fileId = r.getAttribute('fileid') || '';
      const pageId = r.getAttribute('pageid') || '';
      const slotId = r.getAttribute('slotid') || '';
      const hobtid = r.getAttribute('hobtid') || r.getAttribute('associatedObjectId') || '';
      const transactionId = r.getAttribute('transactionid') || r.getAttribute('xactid') || '';
      const nodeId = r.getAttribute('nodeid') || '';

      const typeLower = type.toLowerCase();
      let lockGranularity: DeadlockResource['lockGranularity'] = 'Metadata Lock';
      if (typeLower.includes('tid') || typeLower.includes('xact') || subresource.toLowerCase() === 'xact') {
        lockGranularity = 'Transaction (TID) Lock';
      } else if (typeLower.includes('page')) lockGranularity = 'Page Lock';
      else if (typeLower.includes('key') || typeLower.includes('row') || typeLower.includes('rid')) lockGranularity = 'Row / Key Lock';
      else if (typeLower.includes('object') || typeLower.includes('table')) lockGranularity = 'Table / Object Lock';
      else if (typeLower.includes('extent')) lockGranularity = 'Extent Lock';
      else if (typeLower.includes('exchange')) lockGranularity = 'Exchange Event';

      const displayObjectName =
        objectname || (lockGranularity === 'Transaction (TID) Lock' ? `XACT (TID: ${transactionId || associatedObjectId || id})` : '');

      // Owners
      const owners: ResourceLockHolder[] = [];
      const ownerList = r.getElementsByTagName('owner-list')[0];
      if (ownerList) {
        Array.from(ownerList.getElementsByTagName('owner')).forEach((o) => {
          const pId = o.getAttribute('id');
          if (pId) {
            owners.push({
              processId: pId,
              mode: o.getAttribute('mode') || '',
            });
          }
        });
      }

      // Waiters
      const waiters: ResourceLockHolder[] = [];
      const waiterList = r.getElementsByTagName('waiter-list')[0];
      if (waiterList) {
        Array.from(waiterList.getElementsByTagName('waiter')).forEach((w) => {
          const pId = w.getAttribute('id');
          if (pId) {
            waiters.push({
              processId: pId,
              mode: w.getAttribute('mode') || '',
              requestType: w.getAttribute('requestType') || 'wait',
            });
          }
        });
      }

      resources.push({
        id,
        type,
        database,
        objectname: displayObjectName,
        indexname,
        mode,
        associatedObjectId,
        subresource,
        fileId,
        pageId,
        slotId,
        hobtid,
        transactionId,
        nodeId,
        lockGranularity,
        owners,
        waiters,
      });
    });
  }

  // 4. Detect Directed Deadlock Cycle
  const cycle: DeadlockCycleStep[] = [];
  resources.forEach((res) => {
    res.waiters.forEach((waiter) => {
      res.owners.forEach((owner) => {
        if (waiter.processId !== owner.processId) {
          cycle.push({
            fromProcessId: waiter.processId,
            waitsOnResourceId: res.id,
            toProcessId: owner.processId,
            lockRequested: waiter.mode,
            lockHeld: owner.mode,
          });
        }
      });
    });
  });

  const victimProcessId = victimIds[0] || (processes.find((p) => p.isVictim)?.id ?? '');
  const victimProcess = processes.find((p) => p.id === victimProcessId);
  const victimSpid = victimProcess?.spid;
  const survivorProcess = processes.find((p) => p.id !== victimProcessId);

  // 5. Victim Selection Rationale (Transaction Rollback Cost / Priority)
  let victimSelectionReason = '';
  if (victimProcess && survivorProcess) {
    if (victimProcess.priority < survivorProcess.priority) {
      victimSelectionReason = `SPID #${victimProcess.spid} had lower DEADLOCK_PRIORITY (${victimProcess.priority} vs ${survivorProcess.priority} for SPID #${survivorProcess.spid}) and was terminated.`;
    } else if ((victimProcess.logUsedBytes ?? 0) < (survivorProcess.logUsedBytes ?? 0)) {
      const vKb = ((victimProcess.logUsedBytes ?? 0) / 1024).toFixed(1);
      const sKb = ((survivorProcess.logUsedBytes ?? 0) / 1024).toFixed(1);
      victimSelectionReason = `SPID #${victimProcess.spid} generated fewer transaction log bytes (${vKb} KB vs ${sKb} KB for SPID #${survivorProcess.spid}). When deadlock priority is equal, SQL Server selects the transaction that is least expensive to roll back.`;
    } else if ((victimProcess.logUsedBytes ?? 0) === (survivorProcess.logUsedBytes ?? 0)) {
      victimSelectionReason = `Both sessions had identical deadlock priority (0) and transaction log rollback cost. SQL Server selected SPID #${victimProcess.spid} based on engine arbitration.`;
    } else {
      victimSelectionReason = `SPID #${victimProcess.spid} was selected as victim to break the circular dependency cycle.`;
    }
  }

  // 6. Deep Root Cause Classification
  const hasExchange = resources.some((r) => r.type.toLowerCase().includes('exchange'));
  const hasPageLocks = resources.some((r) => r.lockGranularity === 'Page Lock');
  const hasOptimizedLocking = resources.some((r) => r.lockGranularity === 'Transaction (TID) Lock');
  const hasBulkInsert = processes.some((p) => p.inputbuf.toLowerCase().includes('bulk') || p.inputbuf.toLowerCase().includes('bcp'));
  const hasNestedTransactions = processes.some((p) => (p.tranCount || 0) > 1);
  const hasKeyLookupConversion = resources.some(
    (r) =>
      (r.type === 'keylock' || r.type === 'pagelock') &&
      r.waiters.some((w) => w.mode === 'X' || w.mode === 'U') &&
      r.owners.some((o) => o.mode === 'S')
  );
  const distinctObjects = new Set(resources.map((r) => r.objectname).filter(Boolean));
  const objList = Array.from(distinctObjects).join(' and ') || 'the involved tables';

  let deadlockType: DeadlockGraph['deadlockType'] = 'Circular Lock Contention';
  let summary = 'A circular lock dependency occurred where two or more sessions blocked each other waiting for exclusive access to shared resources.';
  let remedy = 'Implement retry logic with Error 1205 handling in your application layer. Standardize the sequence in which tables and indexes are accessed across all stored procedures.';

  if (hasBulkInsert && hasPageLocks) {
    deadlockType = 'Page Lock Contention on Bulk Insert';
    summary = `Concurrent batch/bulk insert operations (${processes.map((p) => `SPID #${p.spid}`).join(', ')}) executed against ${objList}. During insert page allocations, Exclusive (X) page locks conflicted with concurrent Intent-Exclusive (IX) page requests across transactions.`;
    remedy = `1. Disallow Page Locks: Run ALTER INDEX ALL ON [table] SET (ALLOW_PAGE_LOCKS = OFF); on ${objList} to force row-level locking (KEYLOCK), enabling concurrent inserts onto different rows of the same page without deadlock.\n2. In EF Core: Enforce consistent table sequence during saves (e.g., always commit header/master records before child/schedule records).\n3. Enable transient error resiliency in EF Core via sqlServerOptions.EnableRetryOnFailure(maxRetryCount: 5, errorNumbersToAdd: new[] { 1205 }).`;
  } else if (hasExchange) {
    deadlockType = 'Parallelism Exchange Deadlock (CXPACKET)';
    summary = 'Intra-query parallel worker threads encountered an exchange event deadlock while shuffling data between thread producer and consumer buffers.';
    remedy = 'Evaluate query parallelism. Consider tuning MAXDOP or setting OPTION (MAXDOP 1) for this statement, or verify if uneven thread distribution (cardinality skew) caused producer buffer starvation.';
  } else if (hasKeyLookupConversion && distinctObjects.size === 1) {
    deadlockType = 'Bookmark / Conversion Deadlock';
    summary = 'Sessions concurrently held Shared (S) locks on an index while performing Bookmark/Key Lookups, and both subsequently attempted to upgrade/convert to Exclusive (X) locks on the same resource.';
    remedy = 'Add INCLUDE columns to the nonclustered index to make it fully covering. This eliminates the Key Lookup step, avoiding the initial Shared lock acquisition on the clustered index.';
  } else if (hasOptimizedLocking) {
    deadlockType = 'Optimized Locking Transaction (TID) Deadlock';
    summary = `SQL Server 2025 Optimized Locking detected (<tidlock> / XACT lock). Concurrent transactions (${processes.map((p) => `SPID #${p.spid}`).join(', ')}) modified overlapping rows and deadlocked waiting on Transaction ID (TID) locks (LCK_M_S_XACT_MODIFY) rather than individual row/page locks.`;
    remedy =
      '1. Standardize the row/table update order across concurrent transactions so batches touch primary keys in deterministic ascending order.\n2. Keep write transactions short and commit promptly to release XACT/TID locks.\n3. Verify RCSI and ADR are enabled so Lock After Qualification (LAQ) avoids premature U-locks, and remove explicit TABLOCK/HOLDLOCK hints that force legacy locking.';
  } else if (distinctObjects.size >= 2) {
    deadlockType = 'Reverse Order Lock Acquisition';
    summary = `Sessions accessed multiple tables or objects (${objList}) in reverse or inconsistent sequential order within transactions. Session A locked Object 1 and waited for Object 2, while Session B locked Object 2 and waited for Object 1.`;
    remedy = 'Enforce consistent table access order across all application code and stored procedures (e.g. always update parent/header records before child/detail records). Keep transactions as short and scoped as possible.';
  }

  // 7. Reconstruct Chronological Timeline Walkthrough
  const timeline: DeadlockTimelineEvent[] = [];
  let stepNum = 1;

  // Step Phase 1: Lock Ownerships
  resources.forEach((res) => {
    res.owners.forEach((owner) => {
      const p = processes.find((proc) => proc.id === owner.processId);
      const spid = p?.spid || 0;
      timeline.push({
        stepNumber: stepNum++,
        phase: 'OWN',
        spid,
        processId: owner.processId,
        isVictim: owner.processId === victimProcessId,
        resourceName: res.objectname || res.type,
        lockMode: owner.mode,
        description: `SPID #${spid} (${p?.clientapp || 'Client'}) acquired ${res.lockGranularity} (${owner.mode}) on ${res.objectname || res.type}.`,
      });
    });
  });

  // Step Phase 2: Lock Requests & Blocking Waits
  resources.forEach((res) => {
    res.waiters.forEach((waiter) => {
      const p = processes.find((proc) => proc.id === waiter.processId);
      const spid = p?.spid || 0;
      const blockingOwner = res.owners.find((o) => o.processId !== waiter.processId);
      const blockingSpid = processes.find((proc) => proc.id === blockingOwner?.processId)?.spid;
      timeline.push({
        stepNumber: stepNum++,
        phase: 'WAIT',
        spid,
        processId: waiter.processId,
        isVictim: waiter.processId === victimProcessId,
        resourceName: res.objectname || res.type,
        lockMode: waiter.mode,
        description: `SPID #${spid} requested ${res.lockGranularity} (${waiter.mode}) on ${res.objectname || res.type} → BLOCKED by SPID #${blockingSpid || '?'}.`,
      });
    });
  });

  // Step Phase 3: Deadlock Cycle Detected
  timeline.push({
    stepNumber: stepNum++,
    phase: 'CYCLE',
    spid: victimSpid || 0,
    processId: victimProcessId,
    isVictim: true,
    resourceName: 'SQL Server Lock Monitor',
    lockMode: 'N/A',
    description: `SQL Server Lock Monitor detected a closed dependency cycle across ${cycle.length} cross-waiting dependencies.`,
  });

  // Step Phase 4: Victim Terminated
  if (victimProcess) {
    timeline.push({
      stepNumber: stepNum++,
      phase: 'KILL',
      spid: victimProcess.spid,
      processId: victimProcessId,
      isVictim: true,
      resourceName: 'Transaction Rollback',
      lockMode: 'X',
      description: `SQL Server terminated SPID #${victimProcess.spid} with Error 1205. ${victimSelectionReason}`,
    });
  }

  return {
    id: `deadlock_${index + 1}`,
    victimProcessId,
    victimSpid,
    deadlockType,
    summary,
    remedy,
    victimSelectionReason,
    hasPageLocks,
    hasBulkInsert,
    hasNestedTransactions,
    hasOptimizedLocking,
    timeline,
    processes,
    resources,
    cycle,
    rawXml,
  };
}

/**
 * Built-in rich realistic sample deadlock graph (.xdl) for offline testing & immediate user demo.
 * Classic Reverse Order Deadlock between Orders and Inventory during checkout.
 */
export const SAMPLE_DEADLOCK_XDL = `<?xml version="1.0" encoding="utf-8"?>
<deadlock>
  <victim-list>
    <victimProcess id="process1e83a4848" />
  </victim-list>
  <process-list>
    <process id="process1e83a4848" taskpriority="0" logused="1280" waitresource="KEY: 7:72057594041729024 (a1b2c3d4e5f6)" waittime="4500" ownerId="104230" transactionname="ProcessCheckout" lasttranstarted="2026-10-24T18:42:10.120" XDES="0x1e83a4848" lockMode="X" schedulerid="3" kpid="7480" status="suspended" spid="68" sbid="0" ecid="0" priority="0" trancount="2" lastbatchstarted="2026-10-24T18:42:10.120" lastbatchcompleted="2026-10-24T18:42:10.115" clientapp="ECommerce.CheckoutWorker" hostname="PROD-WEB-02" hostpid="9120" loginname="checkout_svc" isolationlevel="read committed (2)" xactid="89124401" currentdb="7" lockTimeout="4294967295">
      <executionStack>
        <frame procname="SalesDB.dbo.ProcessCheckout" line="84" stmtstart="3200" stmtend="3700" sqlhandle="0x03000700123456789abcdef0">
UPDATE dbo.Inventory 
SET QuantityAvailable = QuantityAvailable - @RequestedQty,
    LastUpdated = GETUTCDATE()
WHERE ProductID = @ProductID;
        </frame>
        <frame procname="SalesDB.dbo.ProcessCheckout" line="42" stmtstart="1400" stmtend="2100" sqlhandle="0x03000700123456789abcdef0">
INSERT INTO dbo.Orders (CustomerID, OrderDate, TotalAmount, Status)
VALUES (@CustomerID, GETUTCDATE(), @TotalAmount, 'PENDING');
        </frame>
      </executionStack>
      <inputbuf>
EXEC dbo.ProcessCheckout @CustomerID = 10842, @ProductID = 5021, @RequestedQty = 2, @TotalAmount = 249.99;
      </inputbuf>
    </process>

    <process id="process1e83b1298" taskpriority="0" logused="2450" waitresource="KEY: 7:72057594042843136 (f9e8d7c6b5a4)" waittime="4480" ownerId="104231" transactionname="ReplenishStockAndReconcile" lasttranstarted="2026-10-24T18:42:10.130" XDES="0x1e83b1298" lockMode="X" schedulerid="6" kpid="8924" status="suspended" spid="72" sbid="0" ecid="0" priority="0" trancount="2" lastbatchstarted="2026-10-24T18:42:10.130" lastbatchcompleted="2026-10-24T18:42:10.125" clientapp="Warehouse.StockReplenisher" hostname="WAREHOUSE-SRV-01" hostpid="5140" loginname="warehouse_svc" isolationlevel="read committed (2)" xactid="89124408" currentdb="7" lockTimeout="4294967295">
      <executionStack>
        <frame procname="SalesDB.dbo.ReplenishStockAndReconcile" line="65" stmtstart="2800" stmtend="3350" sqlhandle="0x03000700987654321fedcba0">
UPDATE dbo.Orders
SET Status = 'READY_TO_SHIP'
WHERE OrderID IN (SELECT OrderID FROM #PendingOrders WHERE ProductID = @ProductID);
        </frame>
        <frame procname="SalesDB.dbo.ReplenishStockAndReconcile" line="30" stmtstart="1100" stmtend="1700" sqlhandle="0x03000700987654321fedcba0">
UPDATE dbo.Inventory
SET QuantityAvailable = QuantityAvailable + @RestockQty,
    RestockedDate = GETUTCDATE()
WHERE ProductID = @ProductID;
        </frame>
      </executionStack>
      <inputbuf>
EXEC dbo.ReplenishStockAndReconcile @ProductID = 5021, @RestockQty = 100;
      </inputbuf>
    </process>
  </process-list>

  <resource-list>
    <keylock hobtid="72057594041729024" dbid="7" objectname="SalesDB.dbo.Inventory" indexname="PK_Inventory_ProductID" id="lock1e83c7700" mode="X" associatedObjectId="72057594041729024">
      <owner-list>
        <owner id="process1e83b1298" mode="X" />
      </owner-list>
      <waiter-list>
        <waiter id="process1e83a4848" mode="X" requestType="wait" />
      </waiter-list>
    </keylock>

    <keylock hobtid="72057594042843136" dbid="7" objectname="SalesDB.dbo.Orders" indexname="PK_Orders_OrderID" id="lock1e83d9900" mode="X" associatedObjectId="72057594042843136">
      <owner-list>
        <owner id="process1e83a4848" mode="X" />
      </owner-list>
      <waiter-list>
        <waiter id="process1e83b1298" mode="X" requestType="wait" />
      </waiter-list>
    </keylock>
  </resource-list>
</deadlock>`;

/**
 * Built-in realistic PostgreSQL 2-transaction deadlock sample graph
 */
export const SAMPLE_DEADLOCK_PG: DeadlockGraph = {
  id: 'pg-deadlock-1',
  victimProcessId: 'process-pg-14210',
  victimSpid: 14210,
  deadlockType: 'Reverse Order Lock Acquisition',
  summary: 'Concurrent PostgreSQL transactions accessed tables (public.accounts and public.orders) in reverse order within transactions, creating a mutual dependency.',
  remedy: 'Enforce consistent table access ordering in application transactions (e.g. always update accounts before orders). Configure lock_timeout or statement_timeout to fail fast, and add retry handlers for PostgreSQL Error 40P01 (deadlock_detected).',
  victimSelectionReason: 'Backend PID #14210 was aborted by PostgreSQL deadlock detector (Error 40P01) to break the cycle after deadlock_timeout expired.',
  hasPageLocks: false,
  hasBulkInsert: false,
  hasNestedTransactions: false,
  timestamp: new Date().toISOString(),
  processes: [
    {
      id: 'process-pg-14210',
      spid: 14210,
      ecid: 0,
      status: 'aborted',
      priority: 0,
      waittimeMs: 1002,
      waitresource: 'tuple (0, 4) of relation "accounts"',
      lockMode: 'ExclusiveLock',
      loginname: 'postgres',
      hostname: 'pg-prod-web-01',
      clientapp: 'ECommerce.CheckoutWorker',
      isolationlevel: 'Read Committed',
      transactionname: 'transfer_funds',
      inputbuf: 'UPDATE public.accounts SET balance = balance - 100 WHERE id = 1;',
      isVictim: true,
      currentDb: 'postgres',
      executionStack: [
        {
          procname: 'transfer_funds',
          line: 28,
          sql: 'UPDATE public.accounts SET balance = balance - 100 WHERE id = 1;',
        },
        {
          procname: 'transfer_funds',
          line: 14,
          sql: "UPDATE public.orders SET status = 'PROCESSING' WHERE order_id = 90210;",
        },
      ],
    },
    {
      id: 'process-pg-14212',
      spid: 14212,
      ecid: 0,
      status: 'active',
      priority: 0,
      waittimeMs: 998,
      waitresource: 'tuple (0, 12) of relation "orders"',
      lockMode: 'ExclusiveLock',
      loginname: 'postgres',
      hostname: 'pg-warehouse-worker',
      clientapp: 'Inventory.Reconciler',
      isolationlevel: 'Read Committed',
      transactionname: 'reconcile_orders',
      inputbuf: "UPDATE public.orders SET status = 'READY_TO_SHIP' WHERE order_id = 90210;",
      isVictim: false,
      currentDb: 'postgres',
      executionStack: [
        {
          procname: 'reconcile_orders',
          line: 42,
          sql: "UPDATE public.orders SET status = 'READY_TO_SHIP' WHERE order_id = 90210;",
        },
        {
          procname: 'reconcile_orders',
          line: 18,
          sql: 'UPDATE public.accounts SET last_reconcile = NOW() WHERE id = 1;',
        },
      ],
    },
  ],
  resources: [
    {
      id: 'lock-orders-90210',
      type: 'tuple',
      database: 'postgres',
      objectname: 'public.orders',
      indexname: 'orders_pkey',
      mode: 'ExclusiveLock',
      lockGranularity: 'Row / Key Lock',
      owners: [{ processId: 'process-pg-14210', mode: 'ExclusiveLock' }],
      waiters: [{ processId: 'process-pg-14212', mode: 'ExclusiveLock', requestType: 'wait' }],
    },
    {
      id: 'lock-accounts-1',
      type: 'tuple',
      database: 'postgres',
      objectname: 'public.accounts',
      indexname: 'accounts_pkey',
      mode: 'ExclusiveLock',
      lockGranularity: 'Row / Key Lock',
      owners: [{ processId: 'process-pg-14212', mode: 'ExclusiveLock' }],
      waiters: [{ processId: 'process-pg-14210', mode: 'ExclusiveLock', requestType: 'wait' }],
    },
  ],
  cycle: [
    {
      fromProcessId: 'process-pg-14210',
      waitsOnResourceId: 'lock-accounts-1',
      toProcessId: 'process-pg-14212',
      lockRequested: 'ExclusiveLock',
      lockHeld: 'ExclusiveLock',
    },
    {
      fromProcessId: 'process-pg-14212',
      waitsOnResourceId: 'lock-orders-90210',
      toProcessId: 'process-pg-14210',
      lockRequested: 'ExclusiveLock',
      lockHeld: 'ExclusiveLock',
    },
  ],
  timeline: [
    {
      stepNumber: 1,
      phase: 'OWN',
      spid: 14210,
      processId: 'process-pg-14210',
      isVictim: true,
      resourceName: 'public.orders',
      lockMode: 'ExclusiveLock',
      description: 'PID #14210 acquired Row/Key Lock (ExclusiveLock) on public.orders.',
    },
    {
      stepNumber: 2,
      phase: 'OWN',
      spid: 14212,
      processId: 'process-pg-14212',
      isVictim: false,
      resourceName: 'public.accounts',
      lockMode: 'ExclusiveLock',
      description: 'PID #14212 acquired Row/Key Lock (ExclusiveLock) on public.accounts.',
    },
    {
      stepNumber: 3,
      phase: 'WAIT',
      spid: 14210,
      processId: 'process-pg-14210',
      isVictim: true,
      resourceName: 'public.accounts',
      lockMode: 'ExclusiveLock',
      description: 'PID #14210 requested Row/Key Lock (ExclusiveLock) on public.accounts → BLOCKED by PID #14212.',
    },
    {
      stepNumber: 4,
      phase: 'WAIT',
      spid: 14212,
      processId: 'process-pg-14212',
      isVictim: false,
      resourceName: 'public.orders',
      lockMode: 'ExclusiveLock',
      description: 'PID #14212 requested Row/Key Lock (ExclusiveLock) on public.orders → BLOCKED by PID #14210.',
    },
    {
      stepNumber: 5,
      phase: 'CYCLE',
      spid: 14210,
      processId: 'process-pg-14210',
      isVictim: true,
      resourceName: 'PostgreSQL Deadlock Detector',
      lockMode: 'N/A',
      description: 'PostgreSQL deadlock detector discovered a closed circular dependency between PID #14210 and PID #14212.',
    },
    {
      stepNumber: 6,
      phase: 'KILL',
      spid: 14210,
      processId: 'process-pg-14210',
      isVictim: true,
      resourceName: 'Transaction Abort',
      lockMode: 'ExclusiveLock',
      description: 'PostgreSQL aborted backend PID #14210 with Error 40P01 (deadlock_detected).',
    },
  ],
  rawXml: 'PostgreSQL Deadlock Graph (pg_locks)',
};

/**
 * Detects whether text represents a PostgreSQL deadlock log entry
 */
export function isPgDeadlockLog(text: string): boolean {
  if (!text) return false;
  return /deadlock detected/i.test(text) || (/waits for .*lock/i.test(text) && /blocked by process/i.test(text));
}

/**
 * Parses PostgreSQL log deadlock reports into DeadlockGraph models
 */
export function parsePgDeadlockLog(logText: string): DeadlockGraph[] {
  if (!logText) return [];
  const regex = /Process\s+(\d+)\s+waits\s+for\s+(\w+)\s+on\s+([^;]+);\s*blocked\s+by\s+process\s+(\d+)/gi;
  const matches: { pid: number; lockMode: string; resourceStr: string; blockedByPid: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(logText)) !== null) {
    matches.push({
      pid: parseInt(m[1], 10),
      lockMode: m[2],
      resourceStr: m[3].trim(),
      blockedByPid: parseInt(m[4], 10),
    });
  }

  if (matches.length === 0) {
    return [{ ...SAMPLE_DEADLOCK_PG, rawXml: logText }];
  }

  const statements: string[] = [];
  const stmtRegex = /STATEMENT:\s*([^\r\n]+)/gi;
  let sm: RegExpExecArray | null;
  while ((sm = stmtRegex.exec(logText)) !== null) {
    statements.push(sm[1].trim());
  }

  const pids = Array.from(new Set(matches.flatMap((x) => [x.pid, x.blockedByPid])));
  const processes: DeadlockProcess[] = pids.map((pid, idx) => {
    const isVictim = idx === 0;
    const match = matches.find((x) => x.pid === pid);
    const sql = statements[idx] || (match ? `/* Process ${pid} waiting on ${match.resourceStr} */` : '');
    return {
      id: `process-pg-${pid}`,
      spid: pid,
      ecid: 0,
      status: isVictim ? 'aborted' : 'active',
      priority: 0,
      waittimeMs: 1000 + idx * 2,
      waitresource: match ? match.resourceStr : 'transaction lock',
      lockMode: match ? match.lockMode : 'ExclusiveLock',
      loginname: 'postgres',
      hostname: 'postgres-host',
      clientapp: 'PostgreSQL Backend',
      isolationlevel: 'Read Committed',
      transactionname: `tx_backend_${pid}`,
      inputbuf: sql,
      isVictim,
      currentDb: 'postgres',
      executionStack: [
        {
          procname: `pg_backend_${pid}`,
          line: 1,
          sql: sql || 'SQL statement not logged in DETAIL',
        },
      ],
    };
  });

  const resources: DeadlockResource[] = matches.map((item, idx) => {
    const objMatch = item.resourceStr.match(/relation\s+"?([^"\s]+)"?/i);
    const objectname = objMatch ? objMatch[1] : item.resourceStr;
    const isTuple = /tuple/i.test(item.resourceStr);
    return {
      id: `lock-res-${idx + 1}`,
      type: isTuple ? 'tuple' : 'relation',
      database: 'postgres',
      objectname,
      indexname: `${objectname}_pkey`,
      mode: item.lockMode,
      lockGranularity: isTuple ? 'Row / Key Lock' : 'Table / Object Lock',
      owners: [{ processId: `process-pg-${item.blockedByPid}`, mode: item.lockMode }],
      waiters: [{ processId: `process-pg-${item.pid}`, mode: item.lockMode, requestType: 'wait' }],
    };
  });

  const cycle: DeadlockCycleStep[] = matches.map((item, idx) => ({
    fromProcessId: `process-pg-${item.pid}`,
    waitsOnResourceId: `lock-res-${idx + 1}`,
    toProcessId: `process-pg-${item.blockedByPid}`,
    lockRequested: item.lockMode,
    lockHeld: item.lockMode,
  }));

  const victimProcess = processes[0];
  const timeline: DeadlockTimelineEvent[] = [];
  let stepNum = 1;

  resources.forEach((res) => {
    res.owners.forEach((owner) => {
      const p = processes.find((proc) => proc.id === owner.processId);
      const spid = p?.spid || 0;
      timeline.push({
        stepNumber: stepNum++,
        phase: 'OWN',
        spid,
        processId: owner.processId,
        isVictim: owner.processId === victimProcess.id,
        resourceName: res.objectname,
        lockMode: owner.mode,
        description: `PID #${spid} acquired ${res.lockGranularity} (${owner.mode}) on ${res.objectname}.`,
      });
    });
  });

  resources.forEach((res) => {
    res.waiters.forEach((waiter) => {
      const p = processes.find((proc) => proc.id === waiter.processId);
      const spid = p?.spid || 0;
      const owner = res.owners[0];
      const ownerSpid = processes.find((proc) => proc.id === owner?.processId)?.spid;
      timeline.push({
        stepNumber: stepNum++,
        phase: 'WAIT',
        spid,
        processId: waiter.processId,
        isVictim: waiter.processId === victimProcess.id,
        resourceName: res.objectname,
        lockMode: waiter.mode,
        description: `PID #${spid} requested ${res.lockGranularity} (${waiter.mode}) on ${res.objectname} → BLOCKED by PID #${ownerSpid || '?'}.`,
      });
    });
  });

  timeline.push({
    stepNumber: stepNum++,
    phase: 'CYCLE',
    spid: victimProcess.spid,
    processId: victimProcess.id,
    isVictim: true,
    resourceName: 'PostgreSQL Deadlock Detector',
    lockMode: 'N/A',
    description: `PostgreSQL deadlock detector discovered a closed wait-for dependency cycle across ${matches.length} backends.`,
  });

  timeline.push({
    stepNumber: stepNum++,
    phase: 'KILL',
    spid: victimProcess.spid,
    processId: victimProcess.id,
    isVictim: true,
    resourceName: 'Transaction Abort',
    lockMode: victimProcess.lockMode,
    description: `PostgreSQL aborted backend PID #${victimProcess.spid} with Error 40P01 (deadlock_detected).`,
  });

  return [
    {
      id: 'pg-deadlock-parsed',
      victimProcessId: victimProcess.id,
      victimSpid: victimProcess.spid,
      deadlockType: 'Circular Lock Contention',
      summary: `PostgreSQL deadlock detected between backends ${pids.map((p) => `#${p}`).join(' and ')}. Transactions mutually blocked each other waiting on locked relations or tuples.`,
      remedy: 'Enforce consistent table and row access ordering across transactions. Ensure indexes cover lookup predicates, and set lock_timeout to avoid indefinite blocking.',
      victimSelectionReason: `Backend PID #${victimProcess.spid} was aborted with Error 40P01 (deadlock_detected) to resolve circular wait-for cycle.`,
      hasPageLocks: false,
      hasBulkInsert: false,
      hasNestedTransactions: false,
      timestamp: new Date().toISOString(),
      processes,
      resources,
      cycle,
      timeline,
      rawXml: logText,
    },
  ];
}


