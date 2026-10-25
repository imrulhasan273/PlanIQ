package livedb

import "os"

func getDemoActiveSessions() []ActiveSession {
	return []ActiveSession{
		{
			SPID:               54,
			Status:             "running",
			Command:            "SELECT",
			DatabaseName:       "SalesDB",
			LoginName:          "svc_etl_batch",
			HostName:           "PROD-ETL-01",
			ProgramName:        ".Net SqlClient Data Provider",
			WaitType:           "PAGEIOLATCH_SH",
			WaitTimeMs:         4820,
			LastWaitType:       "PAGEIOLATCH_SH",
			BlockingSPID:       0,
			CPUTimeMs:          45200,
			TotalElapsedTimeMs: 124500,
			LogicalReads:       1842000,
			Writes:             1420,
			GrantedMemoryMB:    256.0,
			QueryText:          "SELECT o.OrderID, o.OrderDate, SUM(od.Quantity * od.UnitPrice) FROM dbo.Orders o JOIN dbo.OrderDetails od ON o.OrderID = od.OrderID WHERE o.OrderDate >= DATEADD(YEAR, -2, GETDATE()) GROUP BY o.OrderID, o.OrderDate OPTION (MAXDOP 4);",
			HasPlan:            true,
			PlanHandle:         "0x06000500A1B2C3D4E5F6",
			SQLHandle:          "0x0100050012345678",
			PercentComplete:    64.5,
		},
		{
			SPID:               82,
			Status:             "suspended",
			Command:            "UPDATE",
			DatabaseName:       "SalesDB",
			LoginName:          "checkout_worker",
			HostName:           "PROD-WEB-02",
			ProgramName:        "eCommerce.Api",
			WaitType:           "LCK_M_X",
			WaitTimeMs:         14500,
			LastWaitType:       "LCK_M_X",
			BlockingSPID:       54,
			CPUTimeMs:          1240,
			TotalElapsedTimeMs: 14500,
			LogicalReads:       4500,
			Writes:             12,
			GrantedMemoryMB:    16.0,
			QueryText:          "UPDATE dbo.Inventory SET Quantity = Quantity - 1 WHERE ProductID = 1042 AND WarehouseID = 1;",
			HasPlan:            true,
			PlanHandle:         "0x06000500FFEEDDCCBBAA",
			SQLHandle:          "0x0100050087654321",
			PercentComplete:    0.0,
		},
		{
			SPID:               99,
			Status:             "suspended",
			Command:            "SELECT",
			DatabaseName:       "SalesDB",
			LoginName:          "reporting_user",
			HostName:           "CORP-LAPTOP-14",
			ProgramName:        "Microsoft Power BI Desktop",
			WaitType:           "LCK_M_S",
			WaitTimeMs:         8200,
			LastWaitType:       "LCK_M_S",
			BlockingSPID:       82,
			CPUTimeMs:          510,
			TotalElapsedTimeMs: 8200,
			LogicalReads:       1200,
			Writes:             0,
			GrantedMemoryMB:    32.0,
			QueryText:          "SELECT ProductID, Quantity FROM dbo.Inventory WITH (READCOMMITTED) WHERE WarehouseID = 1;",
			HasPlan:            true,
			PlanHandle:         "0x06000500112233445566",
			SQLHandle:          "0x0100050011223344",
			PercentComplete:    0.0,
		},
		{
			SPID:               103,
			Status:             "running",
			Command:            "SELECT",
			DatabaseName:       "SalesDB",
			LoginName:          "analytics_svc",
			HostName:           "PROD-ANALYTICS",
			ProgramName:        "Python/pyodbc",
			WaitType:           "CXPACKET",
			WaitTimeMs:         1200,
			LastWaitType:       "CXCONSUMER",
			BlockingSPID:       0,
			CPUTimeMs:          182400,
			TotalElapsedTimeMs: 42100,
			LogicalReads:       4200100,
			Writes:             0,
			GrantedMemoryMB:    512.0,
			QueryText:          "SELECT c.CustomerName, COUNT(o.OrderID) as TotalOrders FROM dbo.Customers c LEFT JOIN dbo.Orders o ON c.CustomerID = o.CustomerID GROUP BY c.CustomerName HAVING COUNT(o.OrderID) > 100;",
			HasPlan:            true,
			PlanHandle:         "0x0600050077889900AABB",
			SQLHandle:          "0x0100050055667788",
			PercentComplete:    88.0,
		},
	}
}

func getDemoQueryStoreEntries() []QueryStoreEntry {
	return []QueryStoreEntry{
		{
			QueryID:            1042,
			PlanID:             205,
			QueryText:          "SELECT o.OrderID, o.OrderDate, SUM(od.Quantity * od.UnitPrice) as TotalCost FROM dbo.Orders o JOIN dbo.OrderDetails od ON o.OrderID = od.OrderID WHERE o.OrderDate >= '2024-01-01' GROUP BY o.OrderID, o.OrderDate;",
			ExecutionCount:     14820,
			TotalCPUMs:         2450000.0,
			AvgCPUMs:           165.3,
			TotalDurationMs:    6200000.0,
			AvgDurationMs:      418.3,
			TotalLogicalReads:  18500200,
			AvgLogicalReads:    1248.3,
			TotalPhysicalReads: 42000,
			AvgPhysicalReads:   2.8,
			TotalSpillsMB:      1240.5,
			LastExecutionTime:  "2026-10-25 14:22:10",
		},
		{
			QueryID:            842,
			PlanID:             112,
			QueryText:          "SELECT c.CustomerID, c.Email, o.OrderDate, o.TotalAmount FROM dbo.Customers c JOIN dbo.Orders o ON c.CustomerID = o.CustomerID WHERE c.Country = 'United States' AND o.Status = 'Pending';",
			ExecutionCount:     84500,
			TotalCPUMs:         1850000.0,
			AvgCPUMs:           21.8,
			TotalDurationMs:    3200000.0,
			AvgDurationMs:      37.8,
			TotalLogicalReads:  42500000,
			AvgLogicalReads:    502.9,
			TotalPhysicalReads: 12000,
			AvgPhysicalReads:   0.14,
			TotalSpillsMB:      0.0,
			LastExecutionTime:  "2026-10-25 15:02:44",
		},
		{
			QueryID:            914,
			PlanID:             401,
			QueryText:          "SELECT * FROM dbo.AuditLogs WHERE LogDate >= DATEADD(DAY, -7, GETDATE()) ORDER BY LogID DESC;",
			ExecutionCount:     3200,
			TotalCPUMs:         980000.0,
			AvgCPUMs:           306.2,
			TotalDurationMs:    4100000.0,
			AvgDurationMs:      1281.2,
			TotalLogicalReads:  9400000,
			AvgLogicalReads:    2937.5,
			TotalPhysicalReads: 850000,
			AvgPhysicalReads:   265.6,
			TotalSpillsMB:      480.0,
			LastExecutionTime:  "2026-10-25 15:10:01",
		},
	}
}

func getDemoDeadlocks() []LiveDeadlockReport {
	return []LiveDeadlockReport{
		{
			Timestamp:           "2026-10-25 14:48:12",
			VictimSPID:          68,
			ProcessCount:        2,
			LockedResourceCount: 2,
			DeadlockType:        "Reverse Order Lock Acquisition",
			Summary:             "Session SPID #68 locked dbo.Inventory and requested KEYLOCK on dbo.Orders, while SPID #74 held dbo.Orders and waited for dbo.Inventory.",
			DeadlockGraphXML: `<deadlock-list>
  <deadlock victim="process1f3a2b40">
    <process-list>
      <process id="process1f3a2b40" taskpriority="0" logused="1024" waitresource="KEY: 5:72057594041729024 (a1b2c3d4e5f6)" waittime="4500" ownerId="849201" transactionname="user_transaction" lasttranstarted="2026-10-25T14:48:07" XDES="0x1f3a9900" lockMode="X" schedulerid="3" kpid="4920" status="suspended" spid="68" sbid="0" ecid="0" priority="0" trancount="2" clientapp="eCommerce.CheckoutWorker" hostname="PROD-WEB-02" hostpid="5120" loginname="checkout_svc" isolationlevel="read committed (2)" xactid="1849201" currentdb="5" lockTimeout="4294967295" clientoption1="671088672" clientoption2="128056">
        <executionStack>
          <frame procname="SalesDB.dbo.ProcessOrder" line="48" stmtstart="1840" stmtend="2120" sqlhandle="0x0300050012345678">
UPDATE dbo.Inventory SET Quantity = Quantity - 1 WHERE ProductID = 1042;
          </frame>
        </executionStack>
        <inputbuf>
EXEC dbo.ProcessOrder @OrderId = 98402, @ProductId = 1042;
        </inputbuf>
      </process>
      <process id="process1f3a4e80" taskpriority="0" logused="2048" waitresource="KEY: 5:72057594042843136 (f6e5d4c3b2a1)" waittime="4200" ownerId="849205" transactionname="user_transaction" lasttranstarted="2026-10-25T14:48:08" XDES="0x1f3a8800" lockMode="X" schedulerid="1" kpid="5124" status="suspended" spid="74" sbid="0" ecid="0" priority="0" trancount="2" clientapp="ERP.BatchSync" hostname="PROD-APP-01" hostpid="3812" loginname="erp_svc" isolationlevel="read committed (2)" xactid="1849205" currentdb="5" lockTimeout="4294967295" clientoption1="671088672" clientoption2="128056">
        <executionStack>
          <frame procname="SalesDB.dbo.SyncInventoryBatch" line="92" stmtstart="3420" stmtend="3780" sqlhandle="0x0300050087654321">
UPDATE dbo.Orders SET OrderStatus = 'Allocated' WHERE OrderID = 98402;
          </frame>
        </executionStack>
        <inputbuf>
EXEC dbo.SyncInventoryBatch @BatchId = 442;
        </inputbuf>
      </process>
    </process-list>
    <resource-list>
      <keylock hobtid="72057594041729024" dbid="5" objectname="SalesDB.dbo.Orders" indexname="PK_Orders_OrderID" id="lock1e8f2000" mode="X" flag="2">
        <owner-list>
          <owner id="process1f3a4e80" mode="X"/>
        </owner-list>
        <waiter-list>
          <waiter id="process1f3a2b40" mode="X" requestType="wait"/>
        </waiter-list>
      </keylock>
      <keylock hobtid="72057594042843136" dbid="5" objectname="SalesDB.dbo.Inventory" indexname="PK_Inventory_ProductID" id="lock1e8f3400" mode="X" flag="2">
        <owner-list>
          <owner id="process1f3a2b40" mode="X"/>
        </owner-list>
        <waiter-list>
          <waiter id="process1f3a4e80" mode="X" requestType="wait"/>
        </waiter-list>
      </keylock>
    </resource-list>
  </deadlock>
</deadlock-list>`,
		},
	}
}

func getDemoShowPlanXML() string {
	bytes, err := os.ReadFile("sample_plans/explan.xml")
	if err == nil && len(bytes) > 0 {
		return string(bytes)
	}
	return ""
}
