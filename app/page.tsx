"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Stage = "upload" | "analyzing" | "workspace";
type View = "best" | "children" | "groups" | "export";
type Quality = "good" | "bad";
type ShotType = "individual" | "group";
type Activity = "신체" | "미술" | "감각·과학" | "수·조작" | "음률" | "기타" | "미분류";
type Photo = { id: number; name: string; url: string };
type Child = { id: number; name: string; url: string };
type ImageAnalysis = {
  quality: Quality;
  reasons: string[];
  shotType: ShotType;
  signature: number[] | null;
  score: number;
};

const activities: Activity[] = ["신체", "미술", "감각·과학", "수·조작", "음률", "기타", "미분류"];
const viewLabels: Record<View, string> = {
  best: "베스트 추천",
  children: "개인·아이별 정리",
  groups: "단체 정리",
  export: "결과 내보내기",
};

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [view, setView] = useState<View>("best");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [childName, setChildName] = useState("");
  const [childPhoto, setChildPhoto] = useState<File | null>(null);
  const [qualities, setQualities] = useState<Record<number, Quality>>({});
  const [qualityReasons, setQualityReasons] = useState<Record<number, string[]>>({});
  const [qualityScores, setQualityScores] = useState<Record<number, number>>({});
  const [shotTypes, setShotTypes] = useState<Record<number, ShotType>>({});
  const [names, setNames] = useState<Record<number, number>>({});
  const [activityByPhoto, setActivityByPhoto] = useState<Record<number, Activity>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [goals, setGoals] = useState<Record<number, number>>({});
  const [bestByGroup, setBestByGroup] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState("사진을 준비하고 있어요.");
  const [message, setMessage] = useState("아이 얼굴을 설정하고 오늘 찍은 사진을 올려 주세요.");
  const photoUrls = useRef<string[]>([]);
  const childUrls = useRef<string[]>([]);

  useEffect(() => { photoUrls.current = photos.map((photo) => photo.url); }, [photos]);
  useEffect(() => { childUrls.current = children.map((child) => child.url); }, [children]);
  useEffect(() => () => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    childUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const goodPhotos = photos.filter((photo) => qualities[photo.id] !== "bad");
  const selectedGoodPhotos = goodPhotos.filter((photo) => selected.includes(photo.id));
  const groupedCandidates = useMemo(
    () => groupForBest(goodPhotos, shotTypes, names, activityByPhoto, children, qualityScores),
    [goodPhotos, shotTypes, names, activityByPhoto, children, qualityScores],
  );

  const addChild = () => {
    if (!childName.trim() || !childPhoto) {
      setMessage("아이 이름과 얼굴이 잘 보이는 대표 사진을 함께 넣어 주세요.");
      return;
    }
    const child = { id: Date.now(), name: childName.trim(), url: URL.createObjectURL(childPhoto) };
    setChildren((current) => [...current, child]);
    setGoals((current) => ({ ...current, [child.id]: 3 }));
    setChildName("");
    setChildPhoto(null);
    setMessage(`${child.name} 아이를 추가했어요.`);
  };

  const removeChild = (id: number) => {
    const child = children.find((item) => item.id === id);
    if (child) URL.revokeObjectURL(child.url);
    setChildren((current) => current.filter((item) => item.id !== id));
    setNames((current) => Object.fromEntries(Object.entries(current).filter(([, childId]) => childId !== id)));
  };

  const pickPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 100) {
      setMessage("사진은 한 번에 최대 100장까지 선택할 수 있어요.");
      return;
    }
    if (files.some((file) => !["image/jpeg", "image/png"].includes(file.type))) {
      setMessage("JPG 또는 PNG 사진만 선택할 수 있어요.");
      return;
    }
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    const next = files.map((file, index) => ({ id: index + 1, name: file.name, url: URL.createObjectURL(file) }));
    setPhotos(next);
    setQualities(Object.fromEntries(next.map((photo) => [photo.id, "good"])));
    setShotTypes(Object.fromEntries(next.map((photo) => [photo.id, "individual"])));
    setActivityByPhoto(Object.fromEntries(next.map((photo) => [photo.id, guessActivity(photo.name)])));
    setQualityReasons({});
    setQualityScores({});
    setNames({});
    setSelected(next.map((photo) => photo.id));
    setBestByGroup({});
    setMessage(`${next.length}장의 사진을 불러왔어요. 분석을 시작해 주세요.`);
  };

  const analyzeAll = async () => {
    if (!photos.length) return;
    setStage("analyzing");
    setProgress(4);
    setAnalysisMessage("흔들림과 밝기, 배경을 살펴보고 있어요.");

    const analyses: Array<{ photo: Photo; result: ImageAnalysis }> = [];
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      analyses.push({ photo, result: await analyzeImage(photo.url) });
      setProgress(Math.round(((index + 1) / photos.length) * 62));
    }

    setAnalysisMessage("개인·단체 사진과 아이 얼굴을 분류하고 있어요.");
    const childSignatures = await Promise.all(
      children.map(async (child) => ({ id: child.id, signature: await faceSignature(child.url) })),
    );
    const nextNames: Record<number, number> = {};
    const nextQualities: Record<number, Quality> = {};
    const nextReasons: Record<number, string[]> = {};
    const nextScores: Record<number, number> = {};
    const nextShotTypes: Record<number, ShotType> = {};

    analyses.forEach(({ photo, result }, index) => {
      nextQualities[photo.id] = result.quality;
      nextReasons[photo.id] = result.reasons;
      nextScores[photo.id] = result.score;
      nextShotTypes[photo.id] = result.shotType;
      if (result.shotType === "individual" && result.signature && childSignatures.length) {
        const matched = closestChild(result.signature, childSignatures);
        if (matched && matched.confidence >= 48) nextNames[photo.id] = matched.id;
      }
      setProgress(62 + Math.round(((index + 1) / analyses.length) * 34));
    });

    setQualities(nextQualities);
    setQualityReasons(nextReasons);
    setQualityScores(nextScores);
    setShotTypes(nextShotTypes);
    setNames(nextNames);
    setSelected(photos.filter((photo) => nextQualities[photo.id] === "good").map((photo) => photo.id));
    setProgress(100);
    setAnalysisMessage("분류 제안을 준비했어요.");
    window.setTimeout(() => {
      setStage("workspace");
      setView("best");
    }, 350);
  };

  const toggleSelected = (id: number) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const setQuality = (id: number, quality: Quality) => {
    setQualities((current) => ({ ...current, [id]: quality }));
    setSelected((current) => quality === "good"
      ? (current.includes(id) ? current : [...current, id])
      : current.filter((item) => item !== id));
  };

  const setShotType = (id: number, shotType: ShotType) => {
    setShotTypes((current) => ({ ...current, [id]: shotType }));
    if (shotType === "group") setNames((current) => ({ ...current, [id]: 0 }));
  };

  const openWorkspaceView = (nextView: View) => {
    if (!photos.length) return;
    setView(nextView);
    setStage("workspace");
  };

  const reset = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    children.forEach((child) => URL.revokeObjectURL(child.url));
    setPhotos([]);
    setChildren([]);
    setQualities({});
    setQualityReasons({});
    setQualityScores({});
    setShotTypes({});
    setNames({});
    setActivityByPhoto({});
    setSelected([]);
    setBestByGroup({});
    setStage("upload");
    setView("best");
    setMessage("아이 얼굴을 설정하고 오늘 찍은 사진을 올려 주세요.");
  };

  const downloadList = () => {
    const header = "선택\t품질\t사진구분\t아이\t놀이영역\t베스트\t파일명";
    const rows = goodPhotos.map((photo) => {
      const child = children.find((item) => item.id === names[photo.id]);
      const key = bestKey(photo, shotTypes, names, activityByPhoto, children);
      return [
        selected.includes(photo.id) ? "선택" : "미선택",
        "잘 나온 사진",
        shotTypes[photo.id] === "group" ? "단체" : "개인",
        shotTypes[photo.id] === "group" ? "단체" : child?.name ?? "미분류",
        activityByPhoto[photo.id] ?? "미분류",
        (bestByGroup[key] ?? groupedCandidates[key]?.[0]?.id) === photo.id ? "베스트" : "",
        photo.name,
      ].join("\t");
    });
    downloadText(`\uFEFF${[header, ...rows].join("\n")}`, "사진-분류-결과.tsv");
  };

  const downloadPhotoArchive = async () => {
    const header = "선택\t품질\t사진구분\t아이\t놀이영역\t베스트\t파일명";
    const rows: string[] = [];
    const entries = await Promise.all(selectedGoodPhotos.map(async (photo, index) => {
      const type = shotTypes[photo.id] ?? "individual";
      const child = children.find((item) => item.id === names[photo.id]);
      const owner = type === "group" ? "단체" : child?.name ?? "아이 미분류";
      const activity = activityByPhoto[photo.id] ?? "미분류";
      const key = bestKey(photo, shotTypes, names, activityByPhoto, children);
      const isBest = (bestByGroup[key] ?? groupedCandidates[key]?.[0]?.id) === photo.id;
      rows.push(["선택", "잘 나온 사진", type === "group" ? "단체" : "개인", owner, activity, isBest ? "베스트" : "", photo.name].join("\t"));
      const response = await fetch(photo.url);
      const data = new Uint8Array(await response.arrayBuffer());
      const folder = type === "group" ? `단체/${activity}` : `개인/${owner}/${activity}`;
      return { name: `${safePath(folder)}/${String(index + 1).padStart(3, "0")}_${safeFilename(photo.name)}`, data };
    }));
    entries.unshift({
      name: "사진-분류-결과.tsv",
      data: new TextEncoder().encode(`\uFEFF${[header, ...rows].join("\n")}`),
    });
    downloadBlob(createStoredZip(entries), "사진-분류-결과.zip");
  };

  return (
    <main className="shell">
      <header className="masthead">
        <button className="brand brand-button" onClick={() => setStage("upload")}>사진 고르기 <span>✦</span></button>
        {photos.length > 0 && <button className="home-button" onClick={reset}>새 작업</button>}
      </header>

      {stage !== "analyzing" && (
        <nav className="app-nav workflow-nav" aria-label="사진 정리 단계">
          <button className={stage === "upload" ? "active" : ""} onClick={() => setStage("upload")}>1 아이 설정·업로드</button>
          {(Object.keys(viewLabels) as View[]).map((item, index) => (
            <button
              className={stage === "workspace" && view === item ? "active" : ""}
              disabled={!photos.length}
              key={item}
              onClick={() => openWorkspaceView(item)}
            >
              {index + 2} {viewLabels[item]}
            </button>
          ))}
        </nav>
      )}

      {stage === "upload" && (
        <UploadStage
          photos={photos}
          children={children}
          childName={childName}
          childPhoto={childPhoto}
          message={message}
          setChildName={setChildName}
          setChildPhoto={setChildPhoto}
          addChild={addChild}
          removeChild={removeChild}
          pickPhotos={pickPhotos}
          analyzeAll={analyzeAll}
        />
      )}

      {stage === "analyzing" && (
        <section className="soft-card analysis-page">
          <p className="eyebrow">사진 자동 분석</p>
          <h1>좋은 장면과 분류를<br /><em>찾고 있어요.</em></h1>
          <div className="analysis-box">
            <strong>{progress}% 확인했어요</strong>
            <div className="bar"><span style={{ width: `${progress}%` }} /></div>
            <p>{analysisMessage}</p>
          </div>
          <PhotoStrip photos={photos.slice(0, 8)} />
        </section>
      )}

      {stage === "workspace" && (
        <section className="workspace-page">
          <p className="eyebrow">단계 {Object.keys(viewLabels).indexOf(view) + 2} · {viewLabels[view]}</p>
          {view === "best" && (
            <BestRecommendations
              groups={groupedCandidates}
              children={children}
              shotTypes={shotTypes}
              names={names}
              activityByPhoto={activityByPhoto}
              bestByGroup={bestByGroup}
              setBestByGroup={setBestByGroup}
              setShotType={setShotType}
              setNames={setNames}
              setActivityByPhoto={setActivityByPhoto}
              selected={selected}
              toggleSelected={toggleSelected}
            />
          )}
          {view === "children" && (
            <ByChild
              photos={goodPhotos}
              children={children}
              shotTypes={shotTypes}
              names={names}
              activityByPhoto={activityByPhoto}
              selected={selected}
              toggleSelected={toggleSelected}
            />
          )}
          {view === "groups" && (
            <GroupOrganization
              photos={goodPhotos}
              shotTypes={shotTypes}
              activityByPhoto={activityByPhoto}
              selected={selected}
              setActivityByPhoto={setActivityByPhoto}
              toggleSelected={toggleSelected}
            />
          )}
          {view === "export" && (
            <ExportResults
              photos={goodPhotos}
              children={children}
              shotTypes={shotTypes}
              names={names}
              activityByPhoto={activityByPhoto}
              selected={selected}
              groups={groupedCandidates}
              bestByGroup={bestByGroup}
              downloadList={downloadList}
              downloadPhotoArchive={downloadPhotoArchive}
            />
          )}
        </section>
      )}

      <footer><span>사진 고르기</span><span>좋은 사진을 아이와 놀이별로 한눈에</span></footer>
    </main>
  );
}

function UploadStage(props: {
  photos: Photo[];
  children: Child[];
  childName: string;
  childPhoto: File | null;
  message: string;
  setChildName: (value: string) => void;
  setChildPhoto: (value: File | null) => void;
  addChild: () => void;
  removeChild: (id: number) => void;
  pickPhotos: (event: ChangeEvent<HTMLInputElement>) => void;
  analyzeAll: () => Promise<void>;
}) {
  return (
    <section className="upload-page">
      <div className="intro">
        <p className="eyebrow">보육 사진 정리</p>
        <h1>좋은 사진을<br /><em>아이와 놀이별로.</em></h1>
        <p>아이 얼굴을 먼저 설정하면, 업로드한 사진에서 잘 나온 장면을 고르고 아이·활동별로 정리해요.</p>
      </div>

      <section className="soft-card children-card setup-card">
        <Title num="1" title="아이 얼굴과 이름 설정" note="얼굴이 잘 보이는 정면 사진 권장" />
        <div className="child-form">
          <input value={props.childName} onChange={(event) => props.setChildName(event.target.value)} placeholder="아이 이름" />
          <label className="child-file">
            <input type="file" accept="image/jpeg,image/png" onChange={(event) => props.setChildPhoto(event.target.files?.[0] ?? null)} />
            {props.childPhoto ? props.childPhoto.name : "대표 얼굴 사진 선택"}
          </label>
          <button onClick={props.addChild}>아이 추가</button>
        </div>
        {props.children.length ? (
          <div className="child-list child-setup-list">
            {props.children.map((child, index) => (
              <div className="child-chip" key={child.id}>
                <b className="child-number">{index + 1}</b>
                <img src={child.url} alt={`${child.name} 대표 얼굴`} />
                <span>{child.name}</span>
                <button onClick={() => props.removeChild(child.id)} aria-label={`${child.name} 삭제`}>×</button>
              </div>
            ))}
          </div>
        ) : <p className="helper setup-helper">아이를 등록하지 않아도 개인·단체와 놀이영역 분류는 사용할 수 있어요.</p>}
      </section>

      <section className="soft-card upload-card">
        <Title num="2" title="사진 업로드" note="JPG · PNG / 최대 100장" />
        <label className="drop-zone">
          <input type="file" accept="image/jpeg,image/png" multiple onChange={props.pickPhotos} />
          <span className="upload-icon">↑</span>
          <strong>사진을 끌어 놓거나 선택해 주세요</strong>
          <small>새 사진을 선택하면 현재 업로드 사진을 교체해요.</small>
        </label>
        {props.photos.length > 0 && <PhotoStrip photos={props.photos} />}
      </section>

      <div className="flow-footer">
        <span>{props.message}</span>
        <button className="primary" disabled={!props.photos.length} onClick={() => void props.analyzeAll()}>
          품질·분류 분석 시작 <span>→</span>
        </button>
      </div>
    </section>
  );
}

function QualityReview(props: {
  photos: Photo[];
  qualities: Record<number, Quality>;
  reasons: Record<number, string[]>;
  scores: Record<number, number>;
  selected: number[];
  setQuality: (id: number, value: Quality) => void;
  toggleSelected: (id: number) => void;
}) {
  const goodCount = props.photos.filter((photo) => props.qualities[photo.id] !== "bad").length;
  return (
    <>
      <h1>잘 나온 사진만<br /><em>남겨요.</em></h1>
      <p className="page-lede">흔들림, 너무 어둡거나 밝은 사진, 복잡한 배경과 가장자리에 붙은 얼굴을 먼저 확인해요. 상반신 사진은 괜찮으며 신체 잘림은 마지막으로 직접 확인해 주세요.</p>
      <div className="summary-ribbon">
        <span><b>{props.photos.length}</b>장 전체</span>
        <span className="good"><b>{goodCount}</b>장 잘 나옴</span>
        <span className="bad"><b>{props.photos.length - goodCount}</b>장 배제</span>
      </div>
      <div className="quality-grid">
        {props.photos.map((photo) => {
          const quality = props.qualities[photo.id] ?? "good";
          const isSelected = props.selected.includes(photo.id);
          return (
            <article className={`quality-card ${quality}`} key={photo.id}>
              <div className="quality-image">
                <img src={photo.url} alt={photo.name} />
                <span>{props.scores[photo.id] ?? 70}점</span>
              </div>
              <div className="quality-body">
                <strong>{photo.name}</strong>
                <div className="reason-list">
                  {(props.reasons[photo.id] ?? ["직접 확인 권장"]).map((reason) => <small key={reason}>{reason}</small>)}
                </div>
                <div className="segmented">
                  <button className={quality === "good" ? "active good" : ""} onClick={() => props.setQuality(photo.id, "good")}>잘 나옴</button>
                  <button className={quality === "bad" ? "active bad" : ""} onClick={() => props.setQuality(photo.id, "bad")}>배제</button>
                </div>
                <button className={`select-row ${isSelected ? "checked" : ""}`} onClick={() => props.toggleSelected(photo.id)} disabled={quality === "bad"}>
                  {isSelected ? "✓ 결과에 포함" : "결과에 포함하기"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Classification(props: {
  photos: Photo[];
  children: Child[];
  shotTypes: Record<number, ShotType>;
  names: Record<number, number>;
  activityByPhoto: Record<number, Activity>;
  selected: number[];
  setShotType: (id: number, value: ShotType) => void;
  setNames: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
  toggleSelected: (id: number) => void;
}) {
  return (
    <>
      <h1>개인·단체와 놀이를<br /><em>함께 분류해요.</em></h1>
      <p className="page-lede">자동 제안을 확인하고 사진마다 개인·단체, 아이 이름, 놀이영역을 직접 바꿀 수 있어요.</p>
      <div className="classification-grid">
        {props.photos.map((photo) => {
          const type = props.shotTypes[photo.id] ?? "individual";
          const isSelected = props.selected.includes(photo.id);
          return (
            <article className={`classification-card ${isSelected ? "picked" : ""}`} key={photo.id}>
              <button className="classification-photo" onClick={() => props.toggleSelected(photo.id)}>
                <img src={photo.url} alt={photo.name} />
                <span>{isSelected ? "✓ 선택됨" : "선택하기"}</span>
              </button>
              <div className="classification-fields">
                <strong>{photo.name}</strong>
                <div className="segmented compact">
                  <button className={type === "individual" ? "active" : ""} onClick={() => props.setShotType(photo.id, "individual")}>개인</button>
                  <button className={type === "group" ? "active" : ""} onClick={() => props.setShotType(photo.id, "group")}>단체</button>
                </div>
                {type === "individual" && (
                  <label>아이
                    <select value={props.names[photo.id] || ""} onChange={(event) => props.setNames((current) => ({ ...current, [photo.id]: Number(event.target.value) }))}>
                      <option value="">아이 미분류</option>
                      {props.children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}
                    </select>
                  </label>
                )}
                <label>놀이영역
                  <select value={props.activityByPhoto[photo.id] ?? "미분류"} onChange={(event) => props.setActivityByPhoto((current) => ({ ...current, [photo.id]: event.target.value as Activity }))}>
                    {activities.map((activity) => <option value={activity} key={activity}>{activity}</option>)}
                  </select>
                </label>
              </div>
            </article>
          );
        })}
      </div>
      {!props.photos.length && <div className="empty-state">잘 나온 사진이 없어요. 앞 단계에서 사진을 다시 확인해 주세요.</div>}
    </>
  );
}

function BestRecommendations(props: {
  groups: Record<string, Photo[]>;
  children: Child[];
  shotTypes: Record<number, ShotType>;
  names: Record<number, number>;
  activityByPhoto: Record<number, Activity>;
  bestByGroup: Record<string, number>;
  setBestByGroup: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setShotType: (id: number, value: ShotType) => void;
  setNames: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
  selected: number[];
  toggleSelected: (id: number) => void;
}) {
  const entries = Object.entries(props.groups);
  const individualEntries = entries.filter(([key]) => key.startsWith("individual|"));
  const groupEntries = entries.filter(([key]) => key.startsWith("group|"));
  const renderSection = (title: string, description: string, sectionEntries: Array<[string, Photo[]]>) => (
    <section className="best-type-section">
      <div className="best-type-heading"><div><h2>{title}</h2><p>{description}</p></div><span>{sectionEntries.reduce((sum, [, group]) => sum + group.length, 0)}장</span></div>
      <div className="best-list">
        {sectionEntries.map(([key, group]) => {
          const bestId = props.bestByGroup[key] ?? group[0]?.id;
          return (
            <section className="soft-card best-group" key={key}>
              <div className="group-title"><strong>{readableBestKey(key)}</strong><span>{group.length}장</span></div>
              <div className="best-grid">
                {group.map((photo) => {
                  const type = props.shotTypes[photo.id] ?? "individual";
                  return (
                    <article className={bestId === photo.id ? "best-choice" : ""} key={photo.id}>
                      <button className="best-photo" onClick={() => props.setBestByGroup((current) => ({ ...current, [key]: photo.id }))}>
                        <img src={photo.url} alt={photo.name} />
                        <span>{bestId === photo.id ? "★ 베스트 추천" : "베스트로 선택"}</span>
                      </button>
                      <div className="best-controls">
                        <div className="segmented compact">
                          <button className={type === "individual" ? "active" : ""} onClick={() => props.setShotType(photo.id, "individual")}>개인</button>
                          <button className={type === "group" ? "active" : ""} onClick={() => props.setShotType(photo.id, "group")}>단체</button>
                        </div>
                        {type === "individual" && (
                          <select aria-label={`${photo.name} 아이 선택`} value={props.names[photo.id] || ""} onChange={(event) => props.setNames((current) => ({ ...current, [photo.id]: Number(event.target.value) }))}>
                            <option value="">아이 미분류</option>
                            {props.children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}
                          </select>
                        )}
                        <select aria-label={`${photo.name} 놀이영역 선택`} value={props.activityByPhoto[photo.id] ?? "미분류"} onChange={(event) => props.setActivityByPhoto((current) => ({ ...current, [photo.id]: event.target.value as Activity }))}>
                          {activities.map((activity) => <option value={activity} key={activity}>{activity}</option>)}
                        </select>
                        <button className={`select-row ${props.selected.includes(photo.id) ? "checked" : ""}`} onClick={() => props.toggleSelected(photo.id)}>
                          {props.selected.includes(photo.id) ? "✓ 결과 포함" : "결과 제외"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {!sectionEntries.length && <div className="empty-state">{title}이 아직 없어요.</div>}
    </section>
  );
  return (
    <>
      <h1>개인과 단체를 나눠<br /><em>베스트 사진을 골라요.</em></h1>
      <p className="page-lede">품질 점수가 높은 사진을 먼저 추천해요. 개인·단체, 아이 이름, 놀이영역을 직접 고치고 결과 포함 여부도 선택할 수 있어요.</p>
      {renderSection("개인 사진 베스트", "아이와 놀이영역별로 가장 좋은 사진을 추천해요.", individualEntries)}
      {renderSection("단체 사진 베스트", "놀이영역별 단체 사진 가운데 가장 좋은 장면을 추천해요.", groupEntries)}
      {!entries.length && <div className="empty-state">분류된 잘 나온 사진이 아직 없어요.</div>}
    </>
  );
}

function ByChild(props: {
  photos: Photo[];
  children: Child[];
  shotTypes: Record<number, ShotType>;
  names: Record<number, number>;
  activityByPhoto: Record<number, Activity>;
  selected: number[];
  toggleSelected: (id: number) => void;
}) {
  return (
    <>
      <h1>아이별 사진과 놀이를<br /><em>한눈에 정리해요.</em></h1>
      <p className="page-lede">아이 아래에 놀이영역별 사진 수와 실제 사진을 표시해요. 사진을 눌러 결과 포함 여부도 바꿀 수 있어요.</p>
      <div className="child-detail-list">
        {props.children.map((child) => {
          const childPhotos = props.photos.filter((photo) => props.shotTypes[photo.id] === "individual" && props.names[photo.id] === child.id);
          const picked = childPhotos.filter((photo) => props.selected.includes(photo.id)).length;
          return (
            <section className="soft-card child-detail-card" key={child.id}>
              <div className="child-heading large">
                <img src={child.url} alt={`${child.name} 대표 얼굴`} />
                <div><strong>{child.name}</strong><small>선택 {picked}장 · 분류 {childPhotos.length}장</small></div>
              </div>
              <ActivitySummary photos={childPhotos} activityByPhoto={props.activityByPhoto} />
              <SelectablePhotoGrid photos={childPhotos} selected={props.selected} toggleSelected={props.toggleSelected} activityByPhoto={props.activityByPhoto} />
            </section>
          );
        })}
      </div>
      {!props.children.length && <div className="empty-state">아이 설정에서 이름과 대표 얼굴을 먼저 추가해 주세요.</div>}
    </>
  );
}

function GroupOrganization(props: {
  photos: Photo[];
  shotTypes: Record<number, ShotType>;
  activityByPhoto: Record<number, Activity>;
  selected: number[];
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
  toggleSelected: (id: number) => void;
}) {
  const groupPhotos = props.photos.filter((photo) => props.shotTypes[photo.id] === "group");
  const grouped = activities.reduce<Record<string, Photo[]>>((result, activity) => {
    const list = groupPhotos.filter((photo) => (props.activityByPhoto[photo.id] ?? "미분류") === activity);
    if (list.length) result[activity] = list;
    return result;
  }, {});
  return (
    <>
      <h1>단체 사진을 놀이별로<br /><em>보기 좋게 정리해요.</em></h1>
      <p className="page-lede">단체 사진을 놀이영역별로 모아 보고, 각 사진의 영역과 결과 포함 여부를 직접 바꿀 수 있어요.</p>
      <div className="summary-ribbon">
        <span><b>{groupPhotos.length}</b>장 단체 사진</span>
        <span className="good"><b>{groupPhotos.filter((photo) => props.selected.includes(photo.id)).length}</b>장 결과 포함</span>
      </div>
      <div className="group-organize-list">
        {Object.entries(grouped).map(([activity, list]) => (
          <section className="soft-card group-organize-card" key={activity}>
            <div className="group-title"><strong>{activity}</strong><span>{list.length}장</span></div>
            <div className="group-organize-grid">
              {list.map((photo) => (
                <article className={props.selected.includes(photo.id) ? "picked" : ""} key={photo.id}>
                  <img src={photo.url} alt={photo.name} />
                  <select value={props.activityByPhoto[photo.id] ?? "미분류"} onChange={(event) => props.setActivityByPhoto((current) => ({ ...current, [photo.id]: event.target.value as Activity }))}>
                    {activities.map((item) => <option value={item} key={item}>{item}</option>)}
                  </select>
                  <button className={`select-row ${props.selected.includes(photo.id) ? "checked" : ""}`} onClick={() => props.toggleSelected(photo.id)}>
                    {props.selected.includes(photo.id) ? "✓ 결과 포함" : "결과 제외"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!groupPhotos.length && <div className="empty-state">단체 사진이 아직 없어요. 베스트 추천에서 사진을 단체로 바꿀 수 있어요.</div>}
    </>
  );
}

function Goals(props: {
  children: Child[];
  photos: Photo[];
  shotTypes: Record<number, ShotType>;
  names: Record<number, number>;
  activityByPhoto: Record<number, Activity>;
  selected: number[];
  goals: Record<number, number>;
  setGoals: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  toggleSelected: (id: number) => void;
}) {
  return (
    <>
      <h1>아이마다 사진이 충분한지<br /><em>바로 확인해요.</em></h1>
      <p className="page-lede">아이별 목표와 현재 선택 장수를 비교하고, 놀이영역이 골고루 담겼는지도 확인해요.</p>
      <div className="goal-list expanded">
        {props.children.map((child) => {
          const childPhotos = props.photos.filter((photo) => props.shotTypes[photo.id] === "individual" && props.names[photo.id] === child.id);
          const count = childPhotos.filter((photo) => props.selected.includes(photo.id)).length;
          const goal = props.goals[child.id] ?? 3;
          return (
            <section className="soft-card goal-card" key={child.id}>
              <div className="child-heading goal-heading">
                <img src={child.url} alt={`${child.name} 대표 얼굴`} />
                <div><strong>{child.name}</strong><small>분류 사진 {childPhotos.length}장</small></div>
                <span>선택 <b>{count}</b>장</span>
              </div>
              <div className="goal-numbers">
                <span>현재 선택 {count}장</span>
                <label>목표 <input type="number" min="1" value={goal} onChange={(event) => props.setGoals((current) => ({ ...current, [child.id]: Math.max(1, Number(event.target.value)) }))} />장</label>
              </div>
              <div className="bar"><span style={{ width: `${Math.min(100, count / goal * 100)}%` }} /></div>
              <p className={count >= goal ? "goal-ok" : "goal-missing"}>{count >= goal ? "목표를 채웠어요." : `${goal - count}장이 더 필요해요.`}</p>
              <ActivitySummary photos={childPhotos.filter((photo) => props.selected.includes(photo.id))} activityByPhoto={props.activityByPhoto} />
              <SelectablePhotoGrid photos={childPhotos} selected={props.selected} toggleSelected={props.toggleSelected} activityByPhoto={props.activityByPhoto} />
            </section>
          );
        })}
      </div>
      {!props.children.length && <div className="empty-state">아이 설정에서 아이를 먼저 추가해 주세요.</div>}
    </>
  );
}

function ExportResults(props: {
  photos: Photo[];
  children: Child[];
  shotTypes: Record<number, ShotType>;
  names: Record<number, number>;
  activityByPhoto: Record<number, Activity>;
  selected: number[];
  groups: Record<string, Photo[]>;
  bestByGroup: Record<string, number>;
  downloadList: () => void;
  downloadPhotoArchive: () => Promise<void>;
}) {
  const chosen = props.photos.filter((photo) => props.selected.includes(photo.id));
  const sections = groupForExport(chosen, props.shotTypes, props.names, props.activityByPhoto, props.children);
  const [isSaving, setIsSaving] = useState(false);
  const savePhotos = async () => {
    setIsSaving(true);
    try {
      await props.downloadPhotoArchive();
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <>
      <h1>분류한 모습 그대로<br /><em>결과를 내보내요.</em></h1>
      <p className="page-lede">개인·단체, 아이 이름, 놀이영역과 베스트 표시를 그대로 보존해 목록으로 내려받을 수 있어요.</p>
      <div className="export-toolbar">
        <div><strong>최종 선택 {chosen.length}장</strong><span>잘 나온 사진 중 결과 포함 사진</span></div>
        <div className="export-actions">
          <button className="secondary" onClick={props.downloadList}>분류표만 저장</button>
          <button className="primary" disabled={!chosen.length || isSaving} onClick={() => void savePhotos()}>{isSaving ? "사진을 묶는 중…" : "실제 사진 모두 저장"}</button>
        </div>
      </div>
      <p className="export-note">선택한 원본 사진을 개인/아이/놀이영역과 단체/놀이영역 폴더로 나눈 ZIP 파일에 분류표와 함께 저장해요.</p>
      <div className="export-sections">
        {Object.entries(sections).map(([section, photos]) => (
          <section className="export-child-group" key={section}>
            <div className="group-title"><strong>{section}</strong><span>{photos.length}장</span></div>
            <div className="export-grid">
              {photos.map((photo) => {
                const key = bestKey(photo, props.shotTypes, props.names, props.activityByPhoto, props.children);
                const bestId = props.bestByGroup[key] ?? props.groups[key]?.[0]?.id;
                return (
                  <article className="export-photo" key={photo.id}>
                    <div className="export-image-wrap">
                      <img src={photo.url} alt={photo.name} />
                      {bestId === photo.id && <b>★ 베스트</b>}
                    </div>
                    <strong>{props.activityByPhoto[photo.id] ?? "미분류"}</strong>
                    <span>{photo.name}</span>
                    <a href={photo.url} download={photo.name}>사진 다운로드</a>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {!chosen.length && <div className="empty-state">결과에 포함한 사진이 없어요. 앞 단계에서 사진을 선택해 주세요.</div>}
    </>
  );
}

function Title({ num, title, note }: { num: string; title: string; note: string }) {
  return <div className="section-title"><div><span className="step">{num}</span><h2>{title}</h2></div><p>{note}</p></div>;
}

function PhotoStrip({ photos }: { photos: Photo[] }) {
  return <div className="upload-preview"><div className="preview-head"><strong>선택한 사진</strong><span>{photos.length}장</span></div><div className="thumbnail-row">{photos.slice(0, 10).map((photo) => <img key={photo.id} src={photo.url} alt={photo.name} />)}</div></div>;
}

function ActivitySummary({ photos, activityByPhoto }: { photos: Photo[]; activityByPhoto: Record<number, Activity> }) {
  const counts = activities
    .map((activity) => ({ activity, count: photos.filter((photo) => (activityByPhoto[photo.id] ?? "미분류") === activity).length }))
    .filter((item) => item.count > 0);
  return <div className="activity-summary">{counts.length ? counts.map((item) => <span key={item.activity}>{item.activity} <b>{item.count}</b></span>) : <small>분류된 놀이영역이 없어요.</small>}</div>;
}

function SelectablePhotoGrid({ photos, selected, toggleSelected, activityByPhoto }: { photos: Photo[]; selected: number[]; toggleSelected: (id: number) => void; activityByPhoto: Record<number, Activity> }) {
  return (
    <div className="child-photo-grid detailed">
      {photos.length ? photos.map((photo) => {
        const picked = selected.includes(photo.id);
        return (
          <button className={picked ? "is-selected" : ""} key={photo.id} onClick={() => toggleSelected(photo.id)} aria-pressed={picked}>
            <img src={photo.url} alt={photo.name} />
            <span>{picked ? "✓ 선택됨" : "선택하기"}</span>
            <small>{activityByPhoto[photo.id] ?? "미분류"}</small>
          </button>
        );
      }) : <p>해당 사진이 아직 없어요.</p>}
    </div>
  );
}

function groupForBest(photos: Photo[], shotTypes: Record<number, ShotType>, names: Record<number, number>, activityByPhoto: Record<number, Activity>, children: Child[], qualityScores: Record<number, number>) {
  const groups = photos.reduce<Record<string, Photo[]>>((result, photo) => {
    const key = bestKey(photo, shotTypes, names, activityByPhoto, children);
    (result[key] ??= []).push(photo);
    return result;
  }, {});
  Object.values(groups).forEach((group) => group.sort((left, right) => (qualityScores[right.id] ?? 0) - (qualityScores[left.id] ?? 0)));
  return groups;
}

function bestKey(photo: Photo, shotTypes: Record<number, ShotType>, names: Record<number, number>, activityByPhoto: Record<number, Activity>, children: Child[]) {
  const type = shotTypes[photo.id] ?? "individual";
  const owner = type === "group" ? "단체" : children.find((child) => child.id === names[photo.id])?.name ?? "아이 미분류";
  return `${type}|${owner}|${activityByPhoto[photo.id] ?? "미분류"}`;
}

function readableBestKey(key: string) {
  const [type, owner, activity] = key.split("|");
  return `${type === "group" ? "단체" : owner} · ${activity}`;
}

function groupForExport(photos: Photo[], shotTypes: Record<number, ShotType>, names: Record<number, number>, activityByPhoto: Record<number, Activity>, children: Child[]) {
  return photos.reduce<Record<string, Photo[]>>((groups, photo) => {
    const type = shotTypes[photo.id] ?? "individual";
    const owner = type === "group" ? "단체 사진" : `${children.find((child) => child.id === names[photo.id])?.name ?? "아이 미분류"} · 개인 사진`;
    const key = `${owner} / ${activityByPhoto[photo.id] ?? "미분류"}`;
    (groups[key] ??= []).push(photo);
    return groups;
  }, {});
}

function guessActivity(name: string): Activity {
  const lowered = name.toLowerCase();
  if (/신체|체육|운동|바깥|산책/.test(lowered)) return "신체";
  if (/미술|그림|물감|만들기|점토/.test(lowered)) return "미술";
  if (/감각|과학|실험|관찰|자연/.test(lowered)) return "감각·과학";
  if (/수조작|수학|퍼즐|블록|조작/.test(lowered)) return "수·조작";
  if (/음률|음악|노래|악기|율동/.test(lowered)) return "음률";
  return "미분류";
}

async function analyzeImage(url: string): Promise<ImageAnalysis> {
  const image = await loadImage(url);
  if (!image) return { quality: "bad", reasons: ["사진을 읽지 못함"], shotType: "individual", signature: null, score: 0 };
  const faces = await detectFaces(image);
  const canvas = document.createElement("canvas");
  const size = 120;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { quality: "good", reasons: ["직접 확인 권장"], shotType: faces.length > 1 ? "group" : "individual", signature: null, score: 65 };
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  const gray = new Float32Array(size * size);
  let brightness = 0;
  for (let index = 0; index < gray.length; index += 1) {
    const pixel = index * 4;
    gray[index] = (data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114) / 255;
    brightness += gray[index];
  }
  brightness /= gray.length;
  let laplacian = 0;
  let edgeCount = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = y * size + x;
      laplacian += Math.abs(gray[index] * 4 - gray[index - 1] - gray[index + 1] - gray[index - size] - gray[index + size]);
      if (Math.abs(gray[index] - gray[index + 1]) + Math.abs(gray[index] - gray[index + size]) > 0.28) edgeCount += 1;
    }
  }
  const sharpness = laplacian / ((size - 2) * (size - 2));
  const edgeDensity = edgeCount / ((size - 2) * (size - 2));
  const reasons: string[] = [];
  if (sharpness < 0.075) reasons.push("흔들림 가능성");
  if (brightness < 0.2) reasons.push("사진이 어두움");
  if (brightness > 0.88) reasons.push("사진이 너무 밝음");
  if (edgeDensity > 0.34) reasons.push("배경이 복잡해 보임");
  if (faces.some((face) => face.x < image.naturalWidth * 0.025 || face.y < image.naturalHeight * 0.025 || face.x + face.width > image.naturalWidth * 0.975)) reasons.push("얼굴이 가장자리에 가까움");
  if (!reasons.length) reasons.push("선명도와 구도가 양호함");
  const severe = sharpness < 0.045 || brightness < 0.12 || brightness > 0.95;
  const quality: Quality = severe || reasons.filter((reason) => reason !== "선명도와 구도가 양호함").length >= 3 ? "bad" : "good";
  const score = Math.max(20, Math.min(98, Math.round(88 - Math.max(0, 0.09 - sharpness) * 360 - Math.abs(brightness - 0.54) * 28 - Math.max(0, edgeDensity - 0.3) * 55)));
  return {
    quality,
    reasons,
    shotType: faces.length > 1 ? "group" : "individual",
    signature: faces.length <= 1 ? await faceSignature(url, faces[0]) : null,
    score,
  };
}

type FaceBox = { x: number; y: number; width: number; height: number };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

async function detectFaces(image: HTMLImageElement): Promise<FaceBox[]> {
  const Detector = (window as unknown as { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  if (!Detector) return [];
  try {
    const faces = await new Detector({ fastMode: true, maxDetectedFaces: 12 }).detect(image);
    return faces.map(({ boundingBox }) => ({ x: boundingBox.x, y: boundingBox.y, width: boundingBox.width, height: boundingBox.height }));
  } catch {
    return [];
  }
}

async function faceSignature(url: string, knownFace?: FaceBox): Promise<number[] | null> {
  const image = await loadImage(url);
  if (!image) return null;
  const detected = knownFace ? [knownFace] : await detectFaces(image);
  const face = detected.sort((left, right) => right.width * right.height - left.width * left.height)[0];
  const crop = face
    ? {
        x: Math.max(0, face.x - face.width * 0.28),
        y: Math.max(0, face.y - face.height * 0.36),
        width: Math.min(image.naturalWidth - Math.max(0, face.x - face.width * 0.28), face.width * 1.56),
        height: Math.min(image.naturalHeight - Math.max(0, face.y - face.height * 0.36), face.height * 1.72),
      }
    : { x: image.naturalWidth * 0.2, y: image.naturalHeight * 0.06, width: image.naturalWidth * 0.6, height: image.naturalHeight * 0.7 };
  const canvas = document.createElement("canvas");
  canvas.width = 20;
  canvas.height = 20;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, 20, 20);
  const pixels = context.getImageData(0, 0, 20, 20).data;
  const values: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) values.push((pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114) / 255);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) || 1;
  return values.map((value) => Math.max(-2, Math.min(2, (value - mean) / deviation)) / 2);
}

function closestChild(signature: number[], children: Array<{ id: number; signature: number[] | null }>): { id: number; distance: number; confidence: number } | null {
  let best: { id: number; distance: number; confidence: number } | null = null;
  for (const child of children) {
    if (!child.signature) continue;
    const distance = signature.reduce((sum, value, index) => sum + Math.abs(value - child.signature![index]), 0) / signature.length;
    const confidence = Math.max(0, Math.min(99, Math.round(100 - distance * 155)));
    if (!best || distance < best.distance) best = { id: child.id, distance, confidence };
  }
  return best;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/[. ]+$/g, "") || "사진";
}

function safePath(value: string) {
  return value.split("/").map(safeFilename).join("/");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createStoredZip(entries: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = zipHeader([
      [4, 0x04034b50], [2, 20], [2, 0x0800], [2, 0], [2, dosTime], [2, dosDate],
      [4, checksum], [4, entry.data.length], [4, entry.data.length], [2, name.length], [2, 0],
    ]);
    localParts.push(localHeader, name, entry.data);

    const centralHeader = zipHeader([
      [4, 0x02014b50], [2, 20], [2, 20], [2, 0x0800], [2, 0], [2, dosTime], [2, dosDate],
      [4, checksum], [4, entry.data.length], [4, entry.data.length], [2, name.length], [2, 0],
      [2, 0], [2, 0], [2, 0], [4, 0], [4, offset],
    ]);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + entry.data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = zipHeader([
    [4, 0x06054b50], [2, 0], [2, 0], [2, entries.length], [2, entries.length],
    [4, centralSize], [4, offset], [2, 0],
  ]);
  const blobParts = [...localParts, ...centralParts, end].map((part) => Uint8Array.from(part).buffer);
  return new Blob(blobParts, { type: "application/zip" });
}

function zipHeader(fields: Array<[2 | 4, number]>) {
  const size = fields.reduce((sum, [bytes]) => sum + bytes, 0);
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  fields.forEach(([bytes, value]) => {
    if (bytes === 2) view.setUint16(offset, value & 0xffff, true);
    else view.setUint32(offset, value >>> 0, true);
    offset += bytes;
  });
  return new Uint8Array(buffer);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
