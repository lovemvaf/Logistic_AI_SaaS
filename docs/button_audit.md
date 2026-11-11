### admin\ai-insights
- **Data Columns:** Resource, Correction Detail, Confidence, Actions
- **Detected Buttons:** handleMarkAsUsed(fb.id)} className="text-[10px] font-bold tracking-widest uppercase">
                          ARCHIVE FOR TRAIN
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### branches
- **Detected Buttons:** alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
          
          Register Branch, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>Edit Details, handleDelete(br.id)}>Delete
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### dashboard
- **Detected Buttons:** alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>View All Tasks, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>Run AI Optimizer, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>{action}
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### drivers
- **Detected Buttons:** alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
          
          Register Driver, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>PROFILE, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>ASSIGN TRIP
- **Has Search/Filter:** True
- **Has Form/Modal:** False

### drivers\my-trips
- **Detected Buttons:** alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>View Route
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### finance\cod
- **Data Columns:** Driver, COD Collected, Expenses, Net Remitted, Status, Actions
- **Detected Buttons:** handleApprove(rem.id)} className="text-[10px] font-bold tracking-widest uppercase">
                          APPROVE
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### inventory
- **Data Columns:** Timestamp, Type & Ref, Product & Location, Quantity
- **Detected Buttons:** setIsAdjModalOpen(true)} className="gap-2 border-slate-200">
            
            Stock Adjust, setIsTransferModalOpen(true)} className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            
            Transfer Bin, setIsReceiveModalOpen(true)} className="gap-2 shadow-lg shadow-primary/20">
            
            Receive Inbound, setView('ledger')}
          className={`px-6 py-2 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all ${view === 'ledger' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-ink'}`}
        >
          Transaction Ledger, setView('balance')}
          className={`px-6 py-2 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all ${view === 'balance' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-ink'}`}
        >
          Real-time Balance, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>GENERATE SNAPSHOT, setIsAdjModalOpen(false)} disabled={savingAdj} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Cancel, {savingAdj ? 'SAVING...' : 'AUTHORIZE ADJ'}, !savingReceive && setIsReceiveModalOpen(false)} 
                  disabled={savingReceive}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >, {savingReceive ? 'PROCESSING...' : 'CONFIRM RECEIPT'}, !savingTransfer && setIsTransferModalOpen(false)} 
                  disabled={savingTransfer}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >, {savingTransfer ? 'TRANSFERRING...' : 'EXECUTE TRANSFER'}
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### inventory\adjustments
- **Data Columns:** Date, Product, Change, Reason & Actor
- **Detected Buttons:** setIsModalOpen(true)} className="gap-2 shadow-lg shadow-primary/20">
          
          New Adjustment, setIsModalOpen(false)} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Cancel, {saving ? 'RECORDING...' : 'COMMIT ADJUSTMENT'}
- **Has Search/Filter:** False
- **Has Form/Modal:** True

### inventory\cycle-count
- **Data Columns:** Audit ID, Target Warehouse, Scheduled, Status, Actions
- **Detected Buttons:** setIsModalOpen(true)} className="gap-2 shadow-lg shadow-primary/20">
          
          New Count Plan, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>LAUNCH AUDIT, setIsModalOpen(false)} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Cancel, {saving ? 'CREATING...' : 'CREATE PLAN'}
- **Has Search/Filter:** False
- **Has Form/Modal:** True

### login
- **Detected Buttons:** Sign In to Workspace
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### logistics\dispatch
- **Detected Buttons:** setActiveRoutes([])}>
              CLEAR MAP, {optimizing ? 'AI IS SOLVING VRP...' : `AUTO-ROUTING (AI) - ${orders.length} PKG`}, setActiveTab('drivers')} className={`flex-1 py-4 text-xs font-bold tracking-widest uppercase transition-colors ${activeTab === 'drivers' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-slate-400 hover:bg-slate-50'}`}>
                Drivers, setActiveTab('orders')} className={`flex-1 py-4 text-xs font-bold tracking-widest uppercase transition-colors ${activeTab === 'orders' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-slate-400 hover:bg-slate-50'}`}>
                Orders, { setFeedbackTarget(trip); setIsFeedbackModalOpen(true); }}
                            className="w-full py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-600 uppercase tracking-widest hover:bg-rose-100 transition-colors"
                          >
                            Báo Cáo AI Sai (Feedback), setIsFeedbackModalOpen(false)} disabled={submittingFeedback} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Cancel, {submittingFeedback ? 'SUBMITTING...' : 'SUBMIT FEEDBACK'}
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### logistics\expenses
- **Data Columns:** Driver & Date, Category, Amount, Status, Actions
- **Detected Buttons:** alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>VIEW RECEIPT
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### logistics\sos
- **Detected Buttons:** handleResolve(alert.id)}>
                      MARK AS RESOLVED, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
                      DISPATCH HELP
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### logistics\vehicles
- **Data Columns:** Plate Identity, Asset Type, Max Load (KG), Operation Status, Actions
- **Detected Buttons:** Register Asset, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>, handleDelete(vehicle.id)}>, setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                variant="outline"
                size="sm"
                className="font-bold tracking-widest text-[10px]"
              >
                PREVIOUS, setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                variant="outline"
                size="sm"
                className="font-bold tracking-widest text-[10px]"
              >
                NEXT
- **Has Search/Filter:** True
- **Has Form/Modal:** False

### orders
- **Data Columns:** Order ID, Status, Customer Details, Amount, Actions
- **Detected Buttons:** setIsUploadModalOpen(true)} className="font-bold text-[10px] tracking-widest gap-2">
            
            BULK UPLOAD, { setIsModalOpen(true); setStep(1); }} className="gap-2 shadow-lg shadow-primary/20">
            
            Create New Order, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
                            DETAILS, handleCancelOrder(order.id) : undefined}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                              canCancel 
                                ? 'text-red-500 hover:bg-red-50 active:bg-red-100' 
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                          >
                            CANCEL, !saving && setIsModalOpen(false)} 
                 disabled={saving}
                 className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 disabled:opacity-50"
               >, setStep(1)} disabled={saving} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Back, {step === 1 ? 'CONTINUE' : saving ? 'PROCESSING...' : 'INITIATE ORDER'}, !isUploading && setIsUploadModalOpen(false)} 
                disabled={isUploading}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-all"
              >, setUploadFile(null)} className="text-slate-400 hover:text-red-500 p-2">, setUploadFile(null)} 
                      disabled={isUploading}
                      className="flex-1"
                    >
                      Change File, {isUploading ? 'PROCESSING' : 'UPLOAD & PROCESS'}
- **Has Search/Filter:** False
- **Has Form/Modal:** True

### roles
- **Detected Buttons:** setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/40 active:scale-95 flex items-center gap-2"
        >
          
          Add Role, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
                    Edit Role, handleDelete(role.id, role.name)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${isMyRole ? 'text-slate-300 border-slate-100 cursor-not-allowed' : 'text-red-600 border-red-100 hover:bg-red-50'}`}
                  >
                    Delete, setIsModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                  Cancel, {saving ? 'Creating...' : 'Create Role'}
- **Has Search/Filter:** False
- **Has Form/Modal:** True

### settings
- **Detected Buttons:** setActiveTab('general')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'general' ? 'bg-white shadow-sm text-primary border border-slate-200/60' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            General Details, setActiveTab('operations')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'operations' ? 'bg-white shadow-sm text-primary border border-slate-200/60' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Operations, setActiveTab('integrations')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'integrations' ? 'bg-white shadow-sm text-primary border border-slate-200/60' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Integrations & APIs, setActiveTab('billing')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'billing' ? 'bg-white shadow-sm text-primary border border-slate-200/60' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Billing, setShowSecret(!showSecret)} className="text-[10px] text-primary hover:underline lowercase tracking-normal flex items-center gap-1">
                            {showSecret ? 'Hide Key' : 'Show Key'}, {pingStatus === 'testing' ? 'TESTING CONNECTION...' : 'GỬI PING TEST'}, {saving ? 'Saving Changes...' : 'Save Settings'}
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### users
- **Data Columns:** Team Member, Status, Assigned Roles, Actions
- **Detected Buttons:** setIsModalOpen(true)}
          variant="primary"
          className="gap-2 shadow-lg shadow-primary/20"
        >
          
          Invite New Member, handleDelete(u.id)}
                          variant="ghost"
                          size="sm"
                          className={`font-bold tracking-widest text-[10px] ${isMe ? 'opacity-20' : 'text-ember hover:bg-ember/5'}`}
                        >
                          REVOKE ACCESS, setIsModalOpen(false)} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                  Cancel, {saving ? 'PROVISIONING...' : 'INVITE MEMBER'}
- **Has Search/Filter:** False
- **Has Form/Modal:** True

### warehouses
- **Detected Buttons:** alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
          
          Add New Facility, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>, openDeleteModal(wh)}
                      variant="ghost" 
                      size="sm" 
                      className="p-2 h-9 w-9 rounded-xl hover:bg-ember/5 text-slate-400 hover:text-ember"
                    >, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
                    Structure Management, setIsDeleteModalOpen(false)} 
                  className="flex-1 font-bold uppercase tracking-widest text-[10px]"
                >
                  Cancel, Confirm Termination
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### warehouses\[id]
- **Detected Buttons:** router.back()} className="p-2 h-10 w-10 rounded-full">, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>Add Rack, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>MANAGE BINS, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### wms\equipment
- **Data Columns:** Asset Code, Current Custodian, Timestamp, Custody Status, Actions
- **Detected Buttons:** alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
          New Checkout, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>MARK RETURNED
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### wms\packing
- **Detected Buttons:** {isConnected ? 'READ SCALE' : 'CONNECT SCALE'}, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>Print Packing Slip, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>Finalize & Seal
- **Has Search/Filter:** False
- **Has Form/Modal:** False

### wms\products
- **Data Columns:** SKU Identity, Product Details, Spec (W/V), Status, Actions
- **Detected Buttons:** Add New Product, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>EXPORT CSV, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>IMPORT EXCEL, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>, handleDelete(p.id)} className="p-2 h-9 w-9 rounded-xl text-slate-400 hover:text-ember">, setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                variant="outline"
                size="sm"
                className="font-bold tracking-widest text-[10px]"
              >
                PREVIOUS, setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                variant="outline"
                size="sm"
                className="font-bold tracking-widest text-[10px]"
              >
                NEXT
- **Has Search/Filter:** True
- **Has Form/Modal:** False

### wms\waves
- **Data Columns:** Wave Identification, Current Status, Volume (Ord/Tsk), Initialization, Control
- **Detected Buttons:** setIsModalOpen(true)} className="gap-2 shadow-lg shadow-primary/20">
          
          Create New Wave, alert('Tính năng này đang được phát triển và sẽ có mặt trong bản cập nhật tới!')}>
                          VIEW MANIFEST, setIsModalOpen(false)} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                    Cancel, {creating ? 'BATCHING...' : 'CONFIRM WAVE'}
- **Has Search/Filter:** True
- **Has Form/Modal:** True
