import {
  DeadlockGraph,
  DeadlockProcess,
  DeadlockResource,
  DeadlockStackFrame,
  DeadlockCycleStep,
  ResourceLockHolder,
} from '../types/deadlock';

/**
 * Check if the raw XML text is a SQL Server Deadlock Report (.xdl or .xml)
 */
export function isDeadlockXML(xmlText: string): boolean {
  if (!xmlText) return false;
  const lower = xmlText.toLowerCase();
  return (
    lower.includes('<deadlock') ||
    lower.includes('<victim-list') ||
    lower.includes('xml_deadlock_report')
  );
}

/**
 * Parses raw .xdl or deadlock XML content into structured DeadlockGraph objects.
 */
export function parseDeadlockXML(rawXml: string): DeadlockGraph[] {
  // Strip BOM if present
  let cleanXml = rawXml.trim();
  if (cleanXml.charCodeAt(0) === 0xfeff) {
    cleanXml = cleanXml.slice(1);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXml, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`XML Parse Error: ${parserError.textContent?.slice(0, 200)}`);
  }

  // A file might contain multiple <deadlock> tags or wrapped in <event>
  let deadlockNodes = Array.from(doc.getElementsByTagName('deadlock'));
  if (deadlockNodes.length === 0) {
    // Try lowercase or root
    const root = doc.documentElement;
    if (root.localName === 'deadlock') {
      deadlockNodes = [root];
    }
  }

  if (deadlockNodes.length === 0) {
    throw new Error('No <deadlock> element found in the provided XML/XDL content.');
  }

  return deadlockNodes.map((dlNode, idx) => parseSingleDeadlock(dlNode, idx, cleanXml));
}

function parseSingleDeadlock(dlNode: Element, index: number, rawXml: string): DeadlockGraph {
  // 1. Victims
  const victimList = dlNode.getElementsByTagName('victim-list')[0];
  const victimIds: string[] = [];
  if (victimList) {
    const victims = Array.from(victimList.getElementsByTagName('victimProcess'));
    victims.forEach((v) => {
      const id = v.getAttribute('id');
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
        objectname,
        indexname,
        mode,
        associatedObjectId,
        owners,
        waiters,
      });
    });
  }

  // 4. Detect Directed Deadlock Cycle
  // Process P1 waits on Resource R1, which is owned by Process P2;
  // Process P2 waits on Resource R2, which is owned by Process P1 (or longer cycle)
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

  // 5. Classify Deadlock Root Cause & Type
  let deadlockType: DeadlockGraph['deadlockType'] = 'Circular Lock Contention';
  let summary = 'A classic circular lock dependency occurred where two or more sessions blocked each other waiting for exclusive access to shared resources.';
  let remedy = 'Implement retry logic with Error 1205 handling in your application layer. Standardize the sequence in which tables and indexes are accessed across all stored procedures.';

  const hasExchange = resources.some((r) => r.type.toLowerCase().includes('exchange'));
  const hasKeyLookupConversion = resources.some(
    (r) =>
      (r.type === 'keylock' || r.type === 'pagelock') &&
      r.waiters.some((w) => w.mode === 'X' || w.mode === 'U') &&
      r.owners.some((o) => o.mode === 'S')
  );
  const distinctObjects = new Set(resources.map((r) => r.objectname).filter(Boolean));

  if (hasExchange) {
    deadlockType = 'Parallelism Exchange Deadlock (CXPACKET)';
    summary = 'Intra-query parallel worker threads encountered an exchange event deadlock while shuffling data between thread producer and consumer buffers.';
    remedy = 'Evaluate query parallelism. Consider tuning MAXDOP or setting MAXDOP 1 for this statement, or verify if uneven thread distribution (cardinality skew) caused producer buffer starvation.';
  } else if (hasKeyLookupConversion && distinctObjects.size === 1) {
    deadlockType = 'Bookmark / Conversion Deadlock';
    summary = 'Sessions concurrently held Shared (S) locks on an index while performing Bookmark/Key Lookups, and both subsequently attempted to upgrade/convert to Exclusive (X) locks on the same resource.';
    remedy = 'Add INCLUDE columns to the nonclustered index to make it fully covering. This eliminates the Key Lookup step, avoiding the initial Shared lock acquisition on the clustered index.';
  } else if (distinctObjects.size >= 2) {
    deadlockType = 'Reverse Order Lock Acquisition';
    const objList = Array.from(distinctObjects).join(' and ');
    summary = `Sessions accessed multiple tables or objects (${objList}) in reverse or inconsistent sequential order within transactions. Session A locked Object 1 and waited for Object 2, while Session B locked Object 2 and waited for Object 1.`;
    remedy = 'Enforce consistent table access order across all application code and stored procedures (e.g. always update parent/header records before child/detail records). Keep transactions as short and scoped as possible.';
  }

  const victimProcessId = victimIds[0] || (processes.find((p) => p.isVictim)?.id ?? '');
  const victimSpid = processes.find((p) => p.id === victimProcessId)?.spid;

  return {
    id: `deadlock_${index + 1}`,
    victimProcessId,
    victimSpid,
    deadlockType,
    summary,
    remedy,
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
