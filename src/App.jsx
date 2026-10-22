import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check,
  CheckCircle2, ChevronRight, CircleHelp, Clock3, Copy, Database,
  FileCheck2, FileClock, FilePlus2, Fingerprint, GitBranch, LayoutDashboard,
  Link2, LoaderCircle, LockKeyhole, LogOut, Menu, RefreshCw, ShieldCheck,
  Upload, Wallet, X, AlertTriangle
} from "lucide-react";
import "./App.css";

// Existing DatasetRegistry deployment on Ethereum Sepolia.
const CONTRACT_ADDRESS = "0xa93f77497f5972455D13c95bbBd1cbf443E72316";
const CHAIN_ID = 11155111n;
const EXPLORER = "https://sepolia.etherscan.io";

const ABI = [
  "function nextDatasetId() view returns (uint256)",
  "function registerDataset(string name, string description, bytes32 dataHash) returns (uint256)",
  "function addVersion(uint256 datasetId, bytes32 newHash, string changeDescription)",
  "function getDataset(uint256 datasetId) view returns (tuple(uint256 id,address owner,string name,string description,bytes32 currentHash,uint256 createdAt,bool exists))",
  "function getVersionCount(uint256 datasetId) view returns (uint256)",
  "function getVersion(uint256 datasetId,uint256 versionIndex) view returns (tuple(bytes32 dataHash,bytes32 parentHash,address submittedBy,uint256 timestamp,string changeDescription))",
  "function verifyDataset(uint256 datasetId,bytes32 suppliedHash) view returns (bool)",
  "event DatasetRegistered(uint256 indexed datasetId,address indexed owner,bytes32 dataHash,string name)",
  "event VersionAdded(uint256 indexed datasetId,uint256 indexed versionNumber,bytes32 dataHash,bytes32 parentHash,address indexed submittedBy)"
];

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "register", label: "Register dataset", icon: FilePlus2 },
  { id: "verify", label: "Verify integrity", icon: ShieldCheck },
  { id: "history", label: "Version history", icon: GitBranch },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight }
];

const short = (value = "", start = 8, end = 6) =>
  value ? `${value.slice(0, start)}…${value.slice(-end)}` : "—";

function App() {
  const [page, setPage] = useState("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [account, setAccount] = useState("");
  const [networkName, setNetworkName] = useState("Wallet not connected");
  const [isSepolia, setIsSepolia] = useState(false);
  const [file, setFile] = useState(null);
  const [hash, setHash] = useState("");
  const [datasetId, setDatasetId] = useState("1");
  const [dataset, setDataset] = useState(null);
  const [versionCount, setVersionCount] = useState(null);
  const [versions, setVersions] = useState([]);
  const [description, setDescription] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [message, setMessage] = useState("Connect MetaMask to get started.");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(null);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!window.ethereum?.on) return undefined;
    const syncWallet = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        const network = await provider.getNetwork();
        const connected = accounts[0] || "";
        setAccount(connected);
        setIsSepolia(network.chainId === CHAIN_ID);
        setNetworkName(!connected ? "Wallet not connected" :
          network.chainId === CHAIN_ID ? "Ethereum Sepolia" : `Wrong network · ${network.chainId}`);
      } catch {
        setAccount("");
        setIsSepolia(false);
        setNetworkName("Wallet not connected");
      }
    };
    const onAccounts = (accounts) => {
      setAccount(accounts[0] || "");
      setVerified(null);
      setMessage(accounts.length ? "Wallet account changed." : "Wallet disconnected.");
      syncWallet();
    };
    const onChain = () => {
      setVerified(null);
      setMessage("Network changed. Select Ethereum Sepolia to use TraceChain.");
      syncWallet();
    };
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    syncWallet();
    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccounts);
      window.ethereum.removeListener?.("chainChanged", onChain);
    };
  }, []);

  async function connectWallet() {
    setError("");
    if (!window.ethereum) {
      setError("MetaMask was not detected. Install or enable the MetaMask browser extension.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const address = await signer.getAddress();
      setAccount(address);
      setIsSepolia(network.chainId === CHAIN_ID);
      setNetworkName(network.chainId === CHAIN_ID ? "Ethereum Sepolia" : `Wrong network · ${network.chainId}`);
      setMessage(network.chainId === CHAIN_ID
        ? "Wallet connected to Ethereum Sepolia."
        : "Wallet connected. Switch MetaMask to Ethereum Sepolia.");
      if (network.chainId !== CHAIN_ID) setError("Please switch MetaMask to Ethereum Sepolia (chain ID 11155111).");
    } catch (e) {
      setError(e.code === 4001 ? "Connection request was rejected in MetaMask." : (e.shortMessage || e.message || "Could not connect wallet."));
    }
  }

  async function getContract(write = false) {
    if (!window.ethereum) throw new Error("Install MetaMask to use the blockchain features.");
    if (!ethers.isAddress(CONTRACT_ADDRESS)) throw new Error("Contract address is not configured.");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) throw new Error("Wrong network. Switch MetaMask to Ethereum Sepolia.");
    const runner = write ? await provider.getSigner() : provider;
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, runner);
  }

  async function runAction(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      const text = e.shortMessage || e.reason || e.message || "Something went wrong.";
      setError(text);
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  async function hashFile(selected) {
    setFile(selected || null);
    setHash("");
    setVerified(null);
    if (!selected) return;
    try {
      const digest = await crypto.subtle.digest("SHA-256", await selected.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
      setHash(`0x${hex}`);
      setMessage("File fingerprint calculated locally.");
      setError("");
    } catch {
      setError("Could not calculate a fingerprint for this file.");
    }
  }

  async function loadDatasetData(contract, id) {
    const [d, count] = await Promise.all([contract.getDataset(id), contract.getVersionCount(id)]);
    const nextDataset = {
      id: d.id.toString(), owner: d.owner, name: d.name, description: d.description,
      currentHash: d.currentHash,
      createdAt: new Date(Number(d.createdAt) * 1000).toLocaleString()
    };
    setDataset(nextDataset);
    setVersionCount(Number(count));
    const history = await Promise.all(
      Array.from({ length: Number(count) }, (_, index) => contract.getVersion(id, index))
    );
    setVersions(history.map((v, index) => ({
      number: index + 1,
      hash: v.dataHash,
      parentHash: v.parentHash,
      submitter: v.submittedBy,
      timestamp: new Date(Number(v.timestamp) * 1000).toLocaleString(),
      description: v.changeDescription
    })).reverse());
    setVerified(null);
    return nextDataset;
  }

  async function loadDataset() {
    if (!/^\d+$/.test(datasetId) || BigInt(datasetId) < 1n) {
      setError("Enter a valid positive dataset ID.");
      return;
    }
    await runAction(async () => {
      const contract = await getContract();
      await loadDatasetData(contract, BigInt(datasetId));
      setMessage(`Dataset #${datasetId} and its version history loaded.`);
    });
  }

  async function registerDataset() {
    if (!file || !hash) { setError("Choose a dataset file first."); return; }
    if (!account) { setError("Connect MetaMask before registering a dataset."); return; }
    if (!datasetName.trim()) { setError("Enter a dataset name."); return; }
    await runAction(async () => {
      const contract = await getContract(true);
      const nextId = await contract.nextDatasetId();
      const tx = await contract.registerDataset(datasetName.trim(), description.trim() || "Initial dataset registration", hash);
      setMessage("Registration submitted. Waiting for Sepolia confirmation…");
      await tx.wait();
      const id = nextId.toString();
      setDatasetId(id);
      setLastTransaction({ hash: tx.hash, label: `Dataset #${id} registration`, time: new Date().toLocaleString() });
      await loadDatasetData(contract, nextId);
      setMessage(`Dataset #${id} registered successfully.`);
      setPage("overview");
    });
  }

  async function addVersion() {
    if (!file || !hash) { setError("Choose a file first."); return; }
    if (!account) { setError("Connect MetaMask before adding a version."); return; }
    if (!/^\d+$/.test(datasetId) || BigInt(datasetId) < 1n) { setError("Enter a valid dataset ID."); return; }
    await runAction(async () => {
      const contract = await getContract(true);
      const id = BigInt(datasetId);
      const tx = await contract.addVersion(id, hash, description.trim() || "Dataset modified");
      setMessage("Version update submitted. Waiting for confirmation…");
      await tx.wait();
      setLastTransaction({ hash: tx.hash, label: `Dataset #${id} version update`, time: new Date().toLocaleString() });
      await loadDatasetData(contract, id);
      setMessage(`New version for dataset #${id} recorded successfully.`);
      setPage("history");
    });
  }

  async function verifyDataset() {
    if (!hash) { setError("Choose a file to calculate its SHA-256 fingerprint."); return; }
    if (!/^\d+$/.test(datasetId) || BigInt(datasetId) < 1n) { setError("Enter a valid dataset ID."); return; }
    await runAction(async () => {
      const contract = await getContract();
      const result = await contract.verifyDataset(BigInt(datasetId), hash);
      setVerified(result);
      setMessage(result ? "Integrity check passed. The file matches the latest on-chain version." : "Integrity mismatch. This file does not match the latest on-chain version.");
    });
  }

  async function copyText(value, label = "Value") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setError("Clipboard access was blocked by the browser.");
    }
  }

  const currentPage = NAV.find(item => item.id === page) || NAV[0];
  const PageIcon = currentPage.icon;

  function navigate(id) {
    setPage(id);
    setMobileNav(false);
    setError("");
  }

  function FilePicker({ compact = false }) {
    return (
      <label className={`file-picker ${compact ? "compact" : ""}`}>
        <input type="file" onChange={e => hashFile(e.target.files?.[0])} />
        <span className="file-picker-icon"><Upload size={20} /></span>
        <span className="file-picker-copy">
          <strong>{file ? file.name : "Choose a dataset file"}</strong>
          <small>{file ? `${(file.size / 1024).toFixed(1)} KB · SHA-256 ready` : "CSV, JSON, TXT or any file type"}</small>
        </span>
        <span className="file-picker-action">{file ? "Change file" : "Browse"}</span>
      </label>
    );
  }

  function HashPanel() {
    return (
      <div className="hash-panel">
        <div className="field-head"><label>SHA-256 fingerprint</label>{hash && <button className="text-action" onClick={() => copyText(hash, "Fingerprint")}><Copy size={14} /> {copied === "Fingerprint" ? "Copied" : "Copy"}</button>}</div>
        <code>{hash || "Upload a file to calculate its fingerprint."}</code>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={23} /></div>
          <div><strong>trace<span>chain</span></strong><small>DATA PROVENANCE</small></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={`nav-link ${page === item.id ? "active" : ""}`} onClick={() => navigate(item.id)}>
              <Icon size={18} /><span>{item.label}</span>{page === item.id && <ChevronRight className="nav-chevron" size={15} />}
            </button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className={`network-indicator ${isSepolia ? "online" : ""}`} />
          <div><strong>{isSepolia ? "Ethereum Sepolia" : "Network status"}</strong><small>{networkName}</small></div>
        </div>
      </aside>

      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button>
            <div><div className="breadcrumb">Workspace <span>/</span> {currentPage.label}</div><h1>{currentPage.label}</h1></div>
          </div>
          <div className="topbar-actions">
            <div className={`network-pill ${isSepolia ? "good" : "warn"}`}><span />{isSepolia ? "Sepolia testnet" : "Network check"}</div>
            <button className="wallet-button" onClick={connectWallet}><Wallet size={16} />{account ? short(account, 6, 4) : "Connect wallet"}</button>
          </div>
        </header>

        {error && <div className="notice notice-error"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
        {message && <div className="status-line"><span className="status-dot" />{message}</div>}

        {page === "overview" && <div className="page-content">
          <section className="welcome-card">
            <div className="welcome-text">
              <span className="overline"><span className="tiny-dot" /> BLOCKCHAIN DATA INTEGRITY</span>
              <h2>Know your data.<br /><span>Trust every change.</span></h2>
              <p>Keep a verifiable history of your datasets. Register a fingerprint, track updates, and check integrity whenever you need.</p>
              <div className="welcome-actions"><button className="btn btn-primary" onClick={() => navigate("register")}><FilePlus2 size={16} /> Register dataset</button><button className="btn btn-quiet" onClick={() => navigate("verify")}><ShieldCheck size={16} /> Verify a file</button></div>
            </div>
            <div className="welcome-visual"><div className="visual-ring ring-a" /><div className="visual-ring ring-b" /><div className="visual-icon"><ShieldCheck size={42} /></div><span className="visual-tag">SHA-256</span><span className="visual-tag visual-tag-bottom">ON-CHAIN</span></div>
          </section>
          <section className="stat-grid">
            <div className="stat-card"><div className="stat-icon violet"><Database size={18} /></div><span>Selected dataset</span><strong>{dataset ? `#${dataset.id}` : "—"}</strong><small>{dataset?.name || "Load a dataset to begin"}</small></div>
            <div className="stat-card"><div className="stat-icon blue"><GitBranch size={18} /></div><span>Recorded versions</span><strong>{versionCount ?? "—"}</strong><small>Stored in the smart contract</small></div>
            <div className="stat-card"><div className="stat-icon green"><ShieldCheck size={18} /></div><span>File integrity</span><strong className={verified === true ? "text-good" : verified === false ? "text-bad" : ""}>{verified === null ? "Not checked" : verified ? "Verified" : "Mismatch"}</strong><small>{verified === null ? "Run a hash comparison" : verified ? "Hash matches latest version" : "Hash differs from latest version"}</small></div>
          </section>
          <section className="section-heading"><div><h2>Quick actions</h2><p>Choose one task at a time. Your workflow stays simple.</p></div></section>
          <section className="quick-grid">
            <button className="quick-card" onClick={() => navigate("register")}><span className="quick-icon violet"><FilePlus2 size={20} /></span><strong>Register a dataset</strong><p>Store a new dataset fingerprint on the blockchain.</p><span className="quick-link">Start registration <ArrowUpRight size={14} /></span></button>
            <button className="quick-card" onClick={() => navigate("verify")}><span className="quick-icon green"><Fingerprint size={20} /></span><strong>Verify file integrity</strong><p>Compare a selected file against the latest registered hash.</p><span className="quick-link">Verify a file <ArrowUpRight size={14} /></span></button>
            <button className="quick-card" onClick={() => navigate("history")}><span className="quick-icon blue"><GitBranch size={20} /></span><strong>Explore version history</strong><p>Review recorded changes, timestamps and submitters.</p><span className="quick-link">View history <ArrowUpRight size={14} /></span></button>
          </section>
          <section className="bottom-grid">
            <div className="card">
              <div className="card-heading"><div><h3>Current dataset</h3><p>Details from the selected on-chain record.</p></div><Database size={19} /></div>
              {dataset ? <div className="detail-list"><div><span>Name</span><strong>{dataset.name}</strong></div><div><span>Owner</span><code>{short(dataset.owner, 10, 6)}</code></div><div><span>Created</span><strong>{dataset.createdAt}</strong></div><div><span>Current hash</span><code>{short(dataset.currentHash, 12, 8)}</code></div></div> : <div className="empty-state"><Database size={22} /><p>No dataset loaded yet.</p><button className="btn btn-secondary" onClick={() => navigate("history")}>Load a dataset</button></div>}
            </div>
            <div className="card">
              <div className="card-heading"><div><h3>Latest activity</h3><p>Most recent transaction from this session.</p></div><Activity size={19} /></div>
              {lastTransaction ? <div className="transaction-preview"><div className="success-icon"><Check size={18} /></div><div><strong>{lastTransaction.label}</strong><small>{lastTransaction.time}</small><a href={`${EXPLORER}/tx/${lastTransaction.hash}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={13} /></a></div></div> : <div className="empty-state"><FileClock size={22} /><p>No new transactions in this session.</p><button className="btn btn-secondary" onClick={() => navigate("transactions")}>Transaction details</button></div>}
            </div>
          </section>
        </div>}

        {page === "register" && <div className="page-content narrow-page">
          <div className="page-intro"><span className="page-icon violet"><FilePlus2 size={22} /></span><div><h2>Register a dataset</h2><p>Create a new on-chain record for a dataset. The file itself stays on your device; only its fingerprint and metadata are recorded.</p></div></div>
          <section className="card form-card">
            <div className="step-label">STEP 1 <span>·</span> SELECT A FILE</div>
            <FilePicker />
            <HashPanel />
            <div className="step-label">STEP 2 <span>·</span> ADD DETAILS</div>
            <label className="form-label" htmlFor="dataset-name">Dataset name</label>
            <input id="dataset-name" className="form-input" value={datasetName} onChange={e => setDatasetName(e.target.value)} placeholder="e.g. Cleaned training dataset" />
            <label className="form-label" htmlFor="dataset-description">Description <span className="optional">Optional</span></label>
            <textarea id="dataset-description" className="form-input textarea" rows="3" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this dataset contain? What is its source?" />
            <div className="info-callout"><LockKeyhole size={16} /><span>Your file is hashed locally in your browser. The file contents are not uploaded to the blockchain.</span></div>
            <button className="btn btn-primary btn-wide" disabled={busy || !file || !hash || !datasetName.trim()} onClick={registerDataset}>{busy ? <LoaderCircle className="spin" size={17} /> : <Database size={17} />}{busy ? "Waiting for confirmation…" : "Register dataset on Sepolia"}</button>
          </section>
        </div>}

        {page === "verify" && <div className="page-content narrow-page">
          <div className="page-intro"><span className="page-icon green"><ShieldCheck size={22} /></span><div><h2>Verify file integrity</h2><p>Upload the file you want to check. TraceChain compares its SHA-256 fingerprint with the latest version recorded on-chain.</p></div></div>
          <section className="card form-card">
            <label className="form-label" htmlFor="verify-id">Dataset ID</label>
            <div className="inline-input"><input id="verify-id" className="form-input" type="number" min="1" value={datasetId} onChange={e => setDatasetId(e.target.value)} /><button className="btn btn-secondary" onClick={loadDataset} disabled={busy}><RefreshCw size={15} /> Load record</button></div>
            <div className="step-label">SELECT FILE TO VERIFY</div>
            <FilePicker compact />
            <HashPanel />
            <button className="btn btn-primary btn-wide" disabled={busy || !hash} onClick={verifyDataset}>{busy ? <LoaderCircle className="spin" size={17} /> : <Fingerprint size={17} />}Verify against latest version</button>
            {verified !== null && <div className={`verification-result ${verified ? "verified" : "mismatch"}`}>{verified ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}<div><strong>{verified ? "Integrity confirmed" : "Integrity mismatch"}</strong><p>{verified ? "This file's fingerprint matches the latest version stored on Sepolia." : "The file differs from the latest registered version. It may be an older version or its contents may have changed."}</p></div></div>}
            {dataset && <div className="record-summary"><h3>Loaded record · Dataset #{dataset.id}</h3><div><span>Name</span><strong>{dataset.name}</strong></div><div><span>Versions</span><strong>{versionCount}</strong></div><div><span>Latest hash</span><code>{short(dataset.currentHash, 14, 10)}</code></div></div>}
          </section>
        </div>}

        {page === "history" && <div className="page-content">
          <div className="page-intro"><span className="page-icon blue"><GitBranch size={22} /></span><div><h2>Version history</h2><p>Review the dataset's on-chain audit trail. Each version stores a fingerprint, timestamp and submitter.</p></div></div>
          <section className="card load-card">
            <div><label className="form-label" htmlFor="history-id">Dataset ID</label><input id="history-id" className="form-input id-input" type="number" min="1" value={datasetId} onChange={e => setDatasetId(e.target.value)} /></div>
            <button className="btn btn-secondary" disabled={busy} onClick={loadDataset}><RefreshCw size={16} />{busy ? "Loading…" : "Load version history"}</button>
          </section>
          {dataset && <section className="history-summary"><div><span>Dataset</span><strong>#{dataset.id} · {dataset.name}</strong></div><div><span>Total versions</span><strong>{versionCount}</strong></div><div><span>Owner</span><code>{short(dataset.owner, 10, 6)}</code></div></section>}
          <section className="card">
            <div className="card-heading"><div><h3>Recorded versions</h3><p>{versions.length ? `${versions.length} records, newest first` : "Load a dataset to display its history."}</p></div><Clock3 size={19} /></div>
            {versions.length ? <div className="timeline">{versions.map(v => <article className="timeline-item" key={v.number}><div className="timeline-marker"><GitBranch size={16} /></div><div className="timeline-body"><div className="timeline-title"><strong>Version {v.number}</strong><span>{v.timestamp}</span></div><p>{v.description}</p><div className="timeline-hash"><code>{v.hash}</code><button className="text-action" onClick={() => copyText(v.hash, `Version ${v.number} hash`)}><Copy size={13} />{copied === `Version ${v.number} hash` ? "Copied" : "Copy hash"}</button></div><small>Submitted by {short(v.submitter, 10, 6)}</small></div></article>)}</div> : <div className="empty-state large"><GitBranch size={26} /><strong>No version history loaded</strong><p>Enter a dataset ID above and load its history.</p></div>}
          </section>
          <section className="card version-add-card"><div className="card-heading"><div><h3>Add a new version</h3><p>Upload a modified file and record its new fingerprint.</p></div><FilePlus2 size={19} /></div><FilePicker compact /><HashPanel /><label className="form-label" htmlFor="version-notes">Change description</label><textarea id="version-notes" className="form-input textarea" rows="2" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Removed duplicate rows" /><button className="btn btn-primary" disabled={busy || !hash || !dataset} onClick={addVersion}>{busy ? <LoaderCircle className="spin" size={17} /> : <GitBranch size={17} />}Add version to dataset #{datasetId}</button></section>
        </div>}

        {page === "transactions" && <div className="page-content narrow-page">
          <div className="page-intro"><span className="page-icon violet"><ArrowLeftRight size={22} /></span><div><h2>Transactions</h2><p>Open confirmed TraceChain transactions in the Sepolia block explorer.</p></div></div>
          <section className="card">
            <div className="card-heading"><div><h3>Latest transaction</h3><p>Transactions made in this browser session.</p></div><Link2 size={19} /></div>
            {lastTransaction ? <div className="tx-detail"><div className="tx-status"><CheckCircle2 size={18} /> Confirmed</div><h3>{lastTransaction.label}</h3><p>{lastTransaction.time}</p><label className="form-label">Transaction hash</label><div className="tx-hash"><code>{lastTransaction.hash}</code><button className="text-action" onClick={() => copyText(lastTransaction.hash, "Transaction hash")}><Copy size={14} />{copied === "Transaction hash" ? "Copied" : "Copy"}</button></div><a className="btn btn-primary" href={`${EXPLORER}/tx/${lastTransaction.hash}`} target="_blank" rel="noreferrer">View on Sepolia Etherscan <ArrowUpRight size={16} /></a></div> : <div className="empty-state large"><ArrowLeftRight size={26} /><strong>No recent transaction in this session</strong><p>When you register a dataset or add a version, its transaction details will appear here.</p></div>}
          </section>
          <div className="info-callout"><CircleHelp size={16} /><span>For older transactions, use the transaction link shown immediately after the operation or search the contract address on Sepolia Etherscan.</span></div>
        </div>}

        <footer className="app-footer"><span><LockKeyhole size={13} /> TraceChain</span><span>Data integrity through decentralization</span><a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">View contract <ArrowUpRight size={13} /></a></footer>
      </main>
    </div>
  );
}

export default App;
