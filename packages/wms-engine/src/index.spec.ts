import { WmsAllocationEngine, AllocationStrategy, InventoryItem, BinCapacity } from './index';

describe('WmsAllocationEngine', () => {
  const mockStock: InventoryItem[] = [
    { id: 'inv_1', binId: 'bin_1', productId: 'prod_1', quantityAvailable: 100, createdAt: new Date('2024-01-01') },
    { id: 'inv_2', binId: 'bin_2', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2024-01-15') },
    { id: 'inv_3', binId: 'bin_3', productId: 'prod_1', quantityAvailable: 75, createdAt: new Date('2024-02-01') },
  ];

  describe('allocate', () => {
    it('should allocate FIFO correctly', () => {
      const result = WmsAllocationEngine.allocate(mockStock, 120, AllocationStrategy.FIFO);

      expect(result).toHaveLength(2);
      expect(result[0].inventoryId).toBe('inv_1');
      expect(result[0].allocatedQuantity).toBe(100);
      expect(result[1].inventoryId).toBe('inv_2');
      expect(result[1].allocatedQuantity).toBe(20);
    });

    it('should allocate LIFO correctly', () => {
      const result = WmsAllocationEngine.allocate(mockStock, 120, AllocationStrategy.LIFO);

      expect(result).toHaveLength(2);
      expect(result[0].inventoryId).toBe('inv_3');
      expect(result[0].allocatedQuantity).toBe(75);
      expect(result[1].inventoryId).toBe('inv_2');
      expect(result[1].allocatedQuantity).toBe(45);
    });

    it('should allocate FEFO correctly with expiry dates', () => {
      const stockWithExpiry: InventoryItem[] = [
        { id: 'inv_1', binId: 'bin_1', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2024-01-01'), expiryDate: new Date('2024-12-31') },
        { id: 'inv_2', binId: 'bin_2', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2024-01-15'), expiryDate: new Date('2024-06-30') },
      ];

      const result = WmsAllocationEngine.allocate(stockWithExpiry, 60, AllocationStrategy.FEFO);

      expect(result).toHaveLength(2);
      expect(result[0].inventoryId).toBe('inv_2');
      expect(result[0].allocatedQuantity).toBe(50);
      expect(result[1].inventoryId).toBe('inv_1');
      expect(result[1].allocatedQuantity).toBe(10);
    });

    it('should throw error for insufficient stock', () => {
      expect(() => WmsAllocationEngine.allocate(mockStock, 300)).toThrow('Insufficient stock');
    });

    it('should handle exact stock amount', () => {
      const result = WmsAllocationEngine.allocate(mockStock, 225);
      expect(result).toHaveLength(3);
      const totalAllocated = result.reduce((sum, r) => sum + r.allocatedQuantity, 0);
      expect(totalAllocated).toBe(225);
    });
  });

  describe('allocateWithCapacity', () => {
    const binCapacities: BinCapacity[] = [
      { binId: 'bin_1', maxWeightKg: 100, maxVolumeCbm: 2, currentWeightKg: 80, currentVolumeCbm: 1.5 },
      { binId: 'bin_2', maxWeightKg: 50, maxVolumeCbm: 1, currentWeightKg: 10, currentVolumeCbm: 0.2 },
    ];

    const stockWithWeight: InventoryItem[] = [
      { id: 'inv_1', binId: 'bin_1', productId: 'prod_1', quantityAvailable: 100, createdAt: new Date('2024-01-01'), weightKg: 1 },
      { id: 'inv_2', binId: 'bin_2', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2024-01-15'), weightKg: 1 },
    ];

    it('should respect weight capacity limits', () => {
      const result = WmsAllocationEngine.allocateWithCapacity(stockWithWeight, 60, binCapacities);

      expect(result.length).toBeGreaterThan(0);
      const totalAllocated = result.reduce((sum, r) => sum + r.allocatedQuantity, 0);
      expect(totalAllocated).toBe(60);
    });
  });

  describe('generateWave', () => {
    it('should generate waves from orders', () => {
      const orders = [
        { orderId: 'ord_1', items: [{ productId: 'prod_1', quantity: 5 }] },
        { orderId: 'ord_2', items: [{ productId: 'prod_1', quantity: 3 }] },
      ];

      const waves = WmsAllocationEngine.generateWave(orders, 10);

      expect(waves).toHaveLength(1);
      expect(waves[0].orders).toContain('ord_1');
      expect(waves[0].orders).toContain('ord_2');
      expect(waves[0].totalItems).toBe(8);
    });

    it('should produce unique wave IDs when multiple waves are created in the same tick', () => {
      // Regression: createWave used `wave_${Date.now()}` which collides when
      // several waves are built within the same millisecond.
      const orders = Array.from({ length: 15 }, (_, i) => ({
        orderId: `ord_${i}`,
        items: [{ productId: 'prod_1', quantity: 1 }],
      }));

      const waves = WmsAllocationEngine.generateWave(orders, 5);

      expect(waves.length).toBe(3);
      const ids = waves.map(w => w.waveId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('assignPutawayBin', () => {
    const bins: BinCapacity[] = [
      { binId: 'bin_1', maxWeightKg: 100, maxVolumeCbm: 2, currentWeightKg: 80, currentVolumeCbm: 1.5 },
      { binId: 'bin_2', maxWeightKg: 50, maxVolumeCbm: 1, currentWeightKg: 10, currentVolumeCbm: 0.2 },
    ];

    it('should assign to least full bin', () => {
      const binId = WmsAllocationEngine.assignPutawayBin('prod_1', bins, 5, 0.1);
      expect(binId).toBe('bin_2');
    });

    it('should return null if no suitable bin', () => {
      const binId = WmsAllocationEngine.assignPutawayBin('prod_1', bins, 1000, 10);
      expect(binId).toBeNull();
    });

    it('should handle empty stock list', () => {
      expect(() => WmsAllocationEngine.allocate([], 10)).toThrow('Insufficient stock');
    });

    it('should handle negative requiredQty', () => {
      const result = WmsAllocationEngine.allocate(mockStock, -5);
      expect(result).toHaveLength(0);
    });

    it('should handle FEFO with mixed expiry dates (some items without expiry)', () => {
      const stockWithMixedExpiry: InventoryItem[] = [
        { id: 'inv_1', binId: 'bin_1', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2024-01-01') },
        { id: 'inv_2', binId: 'bin_2', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2024-01-15'), expiryDate: new Date('2024-06-30') },
        { id: 'inv_3', binId: 'bin_3', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2024-02-01'), expiryDate: new Date('2024-12-31') },
      ];

      const result = WmsAllocationEngine.allocate(stockWithMixedExpiry, 80, AllocationStrategy.FEFO);

      expect(result.length).toBeGreaterThan(0);
      const totalAllocated = result.reduce((sum, r) => sum + r.allocatedQuantity, 0);
      expect(totalAllocated).toBe(80);
    });

    it('should generate multiple waves when orders exceed wave size', () => {
      const orders = Array.from({ length: 15 }, (_, i) => ({
        orderId: `ord_${i}`,
        items: [{ productId: 'prod_1', quantity: 1 }],
      }));

      const waves = WmsAllocationEngine.generateWave(orders, 5);

      expect(waves.length).toBeGreaterThan(1);
      const totalOrders = waves.reduce((sum, w) => sum + w.orders.length, 0);
      expect(totalOrders).toBe(15);
    });

    it('should handle allocateWithCapacity with empty bins', () => {
      const result = WmsAllocationEngine.allocateWithCapacity(mockStock, 10, []);
      expect(result).toHaveLength(0);
    });

    it('should handle empty orders for wave generation', () => {
      const waves = WmsAllocationEngine.generateWave([], 10);
      expect(waves).toHaveLength(0);
    });

    it('should handle single item allocation', () => {
      const result = WmsAllocationEngine.allocate(mockStock, 50, AllocationStrategy.FIFO);
      expect(result).toHaveLength(1);
      expect(result[0].allocatedQuantity).toBe(50);
    });
  });

  describe('regression hardening (R14, R15, R16, expiry)', () => {
    it('R14: allocateWithCapacity tracks cumulative bin weight and volume across multiple lots in the same bin', () => {
      const bins: BinCapacity[] = [
        { binId: 'bin_1', maxWeightKg: 50, maxVolumeCbm: 1.0, currentWeightKg: 40, currentVolumeCbm: 0.7 },
        { binId: 'bin_2', maxWeightKg: 100, maxVolumeCbm: 2.0, currentWeightKg: 0, currentVolumeCbm: 0 },
      ];
      const binsSnapshot = bins.map((b) => ({ ...b }));

      const lots: InventoryItem[] = [
        // Remaining on bin_1 is 10kg and 0.3cbm -> inv_1 consumes all 10kg (5 * 2kg) and 0.25cbm.
        { id: 'inv_1', binId: 'bin_1', productId: 'prod_1', quantityAvailable: 5, createdAt: new Date('2024-01-01'), weightKg: 2, volumeCbm: 0.05 },
        // Same bin_1: if capacity wasn't tracked cumulatively across lots, inv_2 would wrongly pick 5 more units from bin_1.
        { id: 'inv_2', binId: 'bin_1', productId: 'prod_1', quantityAvailable: 10, createdAt: new Date('2024-01-02'), weightKg: 2, volumeCbm: 0.05 },
        { id: 'inv_3', binId: 'bin_2', productId: 'prod_1', quantityAvailable: 10, createdAt: new Date('2024-01-03'), weightKg: 2, volumeCbm: 0.05 },
      ];

      const allocations = WmsAllocationEngine.allocateWithCapacity(lots, 10, bins, AllocationStrategy.FIFO);

      expect(allocations).toHaveLength(2);
      expect(allocations[0]).toMatchObject({ inventoryId: 'inv_1', binId: 'bin_1', allocatedQuantity: 5 });
      expect(allocations[1]).toMatchObject({ inventoryId: 'inv_3', binId: 'bin_2', allocatedQuantity: 5 });
      expect(allocations.find((a) => a.inventoryId === 'inv_2')).toBeUndefined();
      // Caller bin array must remain unmutated.
      expect(bins).toEqual(binsSnapshot);
    });

    it('R15: assignPutawayBin uses dimensionless normalized fill ratios instead of summing raw kg + cbm', () => {
      const bins: BinCapacity[] = [
        // 5% weight used (5000 / 100000), 5% volume used (5 / 100) -> avg fill 0.05 (raw sum = 5005)
        { binId: 'bin_heavy_spacious', maxWeightKg: 100000, maxVolumeCbm: 100, currentWeightKg: 5000, currentVolumeCbm: 5 },
        // 95% weight used (95 / 100), 90% volume used (0.9 / 1.0) -> avg fill 0.925 (raw sum = 95.9)
        { binId: 'bin_small_almost_full', maxWeightKg: 100, maxVolumeCbm: 1.0, currentWeightKg: 95, currentVolumeCbm: 0.9 },
      ];

      const chosen = WmsAllocationEngine.assignPutawayBin('prod_1', bins, 2, 0.05);
      expect(chosen).toBe('bin_heavy_spacious');
    });

    it('R16: generateWave sorts priority desc then zone asc and resolves sourceBinId from productBinMap', () => {
      const orders = [
        { orderId: 'ord_low_b', priority: 1, zone: 'Z-B', items: [{ productId: 'prod_a', quantity: 2 }] },
        { orderId: 'ord_high_b', priority: 5, zone: 'Z-B', items: [{ productId: 'prod_b', quantity: 3 }] },
        { orderId: 'ord_high_a', priority: 5, zone: 'Z-A', items: [{ productId: 'prod_a', quantity: 4 }] },
      ];

      const waves = WmsAllocationEngine.generateWave(orders, 10, {
        prod_a: 'BIN-A-01',
        prod_b: 'BIN-B-02',
      });

      expect(waves).toHaveLength(1);
      expect(waves[0].orders).toEqual(['ord_high_a', 'ord_high_b', 'ord_low_b']);
      expect(waves[0].tasks[0].sourceBinId).toBe('BIN-A-01');
      expect(waves[0].tasks[1].sourceBinId).toBe('BIN-B-02');
      expect(waves[0].totalItems).toBe(9);
      expect(waves[0].estimatedTime).toBe(18);
    });

    it('excludeExpired skips expired lots relative to deterministic options.now in FIFO and FEFO', () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const lots: InventoryItem[] = [
        { id: 'inv_expired', binId: 'bin_1', productId: 'prod_1', quantityAvailable: 50, createdAt: new Date('2026-01-01'), expiryDate: new Date('2026-05-01T00:00:00Z') },
        { id: 'inv_fresh', binId: 'bin_2', productId: 'prod_1', quantityAvailable: 30, createdAt: new Date('2026-02-01'), expiryDate: new Date('2026-09-01T00:00:00Z') },
      ];

      const fifoResult = WmsAllocationEngine.allocate(lots, 20, AllocationStrategy.FIFO, { excludeExpired: true, now });
      expect(fifoResult).toHaveLength(1);
      expect(fifoResult[0].inventoryId).toBe('inv_fresh');

      expect(() =>
        WmsAllocationEngine.allocate(lots, 40, AllocationStrategy.FEFO, { excludeExpired: true, now }),
      ).toThrow('Insufficient stock');
    });
  });
});
