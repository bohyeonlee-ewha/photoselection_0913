"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Stage = "landing" | "upload" | "analyzing" | "workspace";
type View = "individual" | "group" | "export";
type Quality = "good" | "bad";
type ShotType = "individual" | "group";
type Activity = "신체활동" | "미술놀이" | "음률" | "역할놀이" | "언어영역" | "수·조작영역" | "감각·탐구영역" | "실외놀이" | "기타" | "미분류";
type Photo = { id: number; name: string; url: string; persisted?: boolean };
type Child = { id: number; name: string; url: string; descriptor: number[]; persisted: boolean };
type SessionUser = { id: string; email: string | null };
type ExportScope = { type: "all" } | { type: "child"; childId: number } | { type: "group" };
type ImageAnalysis = {
  quality: Quality;
  reasons: string[];
  shotType: ShotType;
  descriptors: number[][];
  score: number;
};

const activities: Activity[] = ["신체활동", "미술놀이", "음률", "역할놀이", "언어영역", "수·조작영역", "감각·탐구영역", "실외놀이", "기타", "미분류"];
const viewLabels: Record<View, string> = { individual: "개인사진 정리", group: "단체사진 정리", export: "결과 저장" };
const demoChildren: Child[] = [
  { id: 101, name: "하늘", url: "/demo/haneul-reference.png", descriptor: [], persisted: false },
  { id: 102, name: "도윤", url: "/demo/doyun-reference.png", descriptor: [], persisted: false },
  { id: 103, name: "지아", url: "/demo/jia-reference.png", descriptor: [], persisted: false },
];
const demoAreas: Activity[] = ["미술놀이", "수·조작영역", "실외놀이"];
const demoPhotoFolders = ["art", "block", "outdoor"] as const;
const demoPhotoChildIds = [101, 102, 103, 102, 0, 101, 103, 102, 0];

export default function Home() {
  const [stage, setStage] = useState<Stage>("landing");
  const [view, setView] = useState<View>("individual");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [childName, setChildName] = useState("");
  const [childPhoto, setChildPhoto] = useState<File | null>(null);
  const [qualities, setQualities] = useState<Record<number, Quality>>({});
  const [qualityReasons, setQualityReasons] = useState<Record<number, string[]>>({});
  const [qualityScores, setQualityScores] = useState<Record<number, number>>({});
  const [shotTypes, setShotTypes] = useState<Record<number, ShotType>>({});
  const [names, setNames] = useState<Record<number, number>>({});
  const [matchedChildren, setMatchedChildren] = useState<Record<number, number[]>>({});
  const [activityByPhoto, setActivityByPhoto] = useState<Record<number, Activity>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [goals, setGoals] = useState<Record<number, number>>({});
  const [bestByGroup, setBestByGroup] = useState<Record<string, number>>({});
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<Record<number, number>>({});
  const [progress, setProgress] = useState(0);
  const [isRegisteringChild, setIsRegisteringChild] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("사진을 준비하고 있어요.");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [message, setMessage] = useState("아이 얼굴을 설정하고 오늘 찍은 사진을 올려 주세요.");
  const [demoMode, setDemoMode] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const photoUrls = useRef<string[]>([]);
  const childUrls = useRef<string[]>([]);

  useEffect(() => { photoUrls.current = photos.map((photo) => photo.url); }, [photos]);
  useEffect(() => { childUrls.current = children.map((child) => child.url); }, [children]);
  useEffect(() => () => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    childUrls.current.filter((url) => url.startsWith("blob:")).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const sessionResponse = await fetch("/api/session", { signal: controller.signal });
        const session = await sessionResponse.json() as { user: SessionUser | null };
        setUser(session.user);
        if (session.user) {
          const childrenResponse = await fetch("/api/children", { signal: controller.signal });
          if (!childrenResponse.ok) throw new Error("아이 목록을 불러오지 못했습니다.");
          const saved = await childrenResponse.json() as { children: Child[] };
          setChildren(saved.children);
          setGoals(Object.fromEntries(saved.children.map((child) => [child.id, 3])));
          const photosResponse = await fetch("/api/photos", { signal: controller.signal });
          if (photosResponse.ok) {
            const savedPhotos = await photosResponse.json() as {
              sessionId: number | null;
              goals: Record<string, number>;
              photos: Array<{ id: number; name: string; url: string; quality: Quality; reasons: string[]; score: number | null; shotType: ShotType; childId: number; matchedChildIds: number[]; activity: Activity | null; selected: boolean; bestKey: string | null; isBest: boolean; duplicateOf: number | null }>;
            };
            if (savedPhotos.sessionId && savedPhotos.photos.length) {
              setSessionId(savedPhotos.sessionId);
              setPhotos(savedPhotos.photos.map((photo) => ({ id: photo.id, name: photo.name, url: photo.url, persisted: true })));
              setQualities(Object.fromEntries(savedPhotos.photos.map((photo) => [photo.id, photo.quality])));
              setQualityReasons(Object.fromEntries(savedPhotos.photos.map((photo) => [photo.id, photo.reasons])));
              setQualityScores(Object.fromEntries(savedPhotos.photos.filter((photo) => photo.score !== null).map((photo) => [photo.id, photo.score as number])));
              setShotTypes(Object.fromEntries(savedPhotos.photos.map((photo) => [photo.id, photo.shotType])));
              setNames(Object.fromEntries(savedPhotos.photos.filter((photo) => photo.childId).map((photo) => [photo.id, photo.childId])));
              setMatchedChildren(Object.fromEntries(savedPhotos.photos.map((photo) => [photo.id, photo.matchedChildIds])));
              setActivityByPhoto(Object.fromEntries(savedPhotos.photos.filter((photo) => photo.activity).map((photo) => [photo.id, photo.activity as Activity])));
              setSelected(savedPhotos.photos.filter((photo) => photo.selected).map((photo) => photo.id));
              setBestByGroup(Object.fromEntries(savedPhotos.photos.filter((photo) => photo.bestKey && photo.isBest).map((photo) => [photo.bestKey as string, photo.id])));
              setDuplicateOf(Object.fromEntries(savedPhotos.photos.filter((photo) => photo.duplicateOf).map((photo) => [photo.id, photo.duplicateOf as number])));
              setGoals(savedPhotos.goals);
              setStage("workspace");
              setView("individual");
            }
          }
          setMessage(saved.children.length
            ? `저장된 아이 ${saved.children.length}명을 불러왔어요.`
            : "로그인했어요. 등록한 아이는 다음 접속에도 자동으로 불러와요.");
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage("저장된 아이 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!controller.signal.aborted) setSessionLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  const goodPhotos = useMemo(
    () => photos.filter((photo) => qualities[photo.id] !== "bad" && !duplicateOf[photo.id]),
    [photos, qualities, duplicateOf],
  );
  const selectedGoodPhotos = useMemo(
    () => goodPhotos.filter((photo) => selected.includes(photo.id)),
    [goodPhotos, selected],
  );
  const groupedCandidates = useMemo(
    () => groupForBest(goodPhotos, shotTypes, names, activityByPhoto, children, qualityScores),
    [goodPhotos, shotTypes, names, activityByPhoto, children, qualityScores],
  );

  const addChild = async () => {
    if (!childName.trim() || !childPhoto) {
      setMessage("아이 이름과 얼굴이 잘 보이는 설정 사진을 함께 넣어 주세요.");
      return;
    }
    const url = URL.createObjectURL(childPhoto);
    setIsRegisteringChild(true);
    setMessage(`${childName.trim()} 아이의 얼굴 특징을 확인하고 있어요.`);
    try {
      const faces = await describeFaces(url);
      if (faces.length !== 1) {
        URL.revokeObjectURL(url);
        setMessage(faces.length === 0
          ? "얼굴을 찾지 못했어요. 얼굴이 크고 선명한 사진으로 바꿔 주세요."
          : "설정 사진에는 한 아이의 얼굴만 보여야 해요. 한 명만 나온 사진으로 바꿔 주세요.");
        return;
      }
      if (faces[0].score < 0.6 || faces[0].frontalness < 0.55) {
        URL.revokeObjectURL(url);
        setMessage("설정 사진의 얼굴이 작거나 옆을 보고 있어요. 정면에 가깝고 선명한 사진으로 바꿔 주세요.");
        return;
      }
      let child: Child = { id: Date.now(), name: childName.trim(), url, descriptor: faces[0].descriptor, persisted: false };
      if (user) {
        const form = new FormData();
        form.set("name", child.name);
        form.set("image", childPhoto);
        form.set("descriptor", JSON.stringify(child.descriptor));
        const response = await fetch("/api/children", { method: "POST", body: form });
        const result = await response.json() as { child?: Child; error?: string };
        if (!response.ok || !result.child) throw new Error(result.error ?? "아이 저장에 실패했습니다.");
        URL.revokeObjectURL(url);
        child = result.child;
      }
      setChildren((current) => [...current, child]);
      setGoals((current) => ({ ...current, [child.id]: 3 }));
      setChildName("");
      setChildPhoto(null);
      setMessage(user
        ? `${child.name} 아이의 설정 사진을 계정에 저장했어요.`
        : `${child.name} 아이를 임시로 등록했어요. 로그인하면 다음에도 불러올 수 있어요.`);
    } catch (error) {
      URL.revokeObjectURL(url);
      setMessage(error instanceof Error ? error.message : "아이 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsRegisteringChild(false);
    }
  };

  const removeChild = async (id: number) => {
    const child = children.find((item) => item.id === id);
    if (child?.persisted) {
      const response = await fetch(`/api/children/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setMessage("저장된 아이를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
    }
    if (child?.url.startsWith("blob:")) URL.revokeObjectURL(child.url);
    setChildren((current) => current.filter((item) => item.id !== id));
    setNames((current) => Object.fromEntries(Object.entries(current).filter(([, childId]) => childId !== id)));
    setMatchedChildren((current) => Object.fromEntries(
      Object.entries(current).map(([photoId, ids]) => [photoId, ids.filter((childId) => childId !== id)]),
    ));
  };

  const pickPhotos = async (event: ChangeEvent<HTMLInputElement>, mode: "replace" | "append") => {
    const files = Array.from(event.target.files ?? []) as File[];
    const total = mode === "append" ? photos.length + files.length : files.length;
    if (total > 100) {
      setMessage(`사진은 최대 100장까지 올릴 수 있어요. 현재 ${photos.length}장이 선택되어 있어요.`);
      event.target.value = "";
      return;
    }
    if (files.some((file) => !["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      setMessage("JPG 또는 PNG 사진만 올릴 수 있고, 사진 한 장은 10MB 이하여야 해요.");
      event.target.value = "";
      return;
    }
    if (!files.length) return;
    if (mode === "replace") photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    const firstId = mode === "append" ? Math.max(0, ...photos.map((photo) => photo.id)) + 1 : 1;
    const next = files.map((file, index) => ({ id: firstId + index, name: file.name, url: URL.createObjectURL(file) }));
    let duplicateMatches: Record<number, number> = {};
    try {
      duplicateMatches = await detectDuplicatePhotos(next, mode === "append" ? photos : []);
    } catch {
      // Duplicate detection is best-effort; an upload must still work if a preview cannot be read.
    }
    const defaults = Object.fromEntries(next.map((photo) => [photo.id, "good" as Quality]));
    const defaultTypes = Object.fromEntries(next.map((photo) => [photo.id, "individual" as ShotType]));
    const defaultActivities = Object.fromEntries(next.map((photo) => [photo.id, guessActivity(photo.name)]));
    setPhotos((current) => mode === "append" ? [...current, ...next] : next);
    setQualities((current) => mode === "append" ? { ...current, ...defaults } : defaults);
    setShotTypes((current) => mode === "append" ? { ...current, ...defaultTypes } : defaultTypes);
    setActivityByPhoto((current) => mode === "append" ? { ...current, ...defaultActivities } : defaultActivities);
    if (mode === "replace") {
      setQualityReasons({});
      setQualityScores({});
      setNames({});
      setMatchedChildren({});
      setBestByGroup({});
      setDuplicateOf({});
    }
    setSelected((current) => mode === "append" ? [...current, ...next.map((photo) => photo.id)] : next.map((photo) => photo.id));
    setRecognitionMessage("");
    setMessage(mode === "append"
      ? `${next.length}장을 추가했어요. 총 ${total}장을 다시 분석해 주세요.`
      : `${next.length}장의 사진을 불러왔어요. 분석을 시작해 주세요.`);
    event.target.value = "";
    if (!user) setDuplicateOf((current) => mode === "append" ? { ...current, ...duplicateMatches } : duplicateMatches);
    if (user) {
      try {
        const form = new FormData();
        files.forEach((file) => form.append("files", file));
        if (mode === "append" && sessionId) form.set("sessionId", String(sessionId));
        const response = await fetch("/api/photos", { method: "POST", body: form });
        const result = await response.json() as { sessionId?: number; photos?: Photo[]; error?: string };
        if (!response.ok || !result.sessionId || !result.photos) throw new Error(result.error ?? "사진 저장에 실패했습니다.");
        setSessionId(result.sessionId);
        const saved = result.photos.map((photo) => ({ ...photo, persisted: true }));
        next.forEach((photo) => URL.revokeObjectURL(photo.url));
        setPhotos((current) => mode === "append" ? [...current.slice(0, -next.length), ...saved] : saved);
        const localToSaved = new Map(next.map((photo, index) => [photo.id, saved[index]?.id]));
        const savedDuplicates = Object.fromEntries(Object.entries(duplicateMatches)
          .map(([id, target]) => [localToSaved.get(Number(id)), localToSaved.get(target) ?? target])
          .filter(([id, target]) => id && target));
        setDuplicateOf((current) => mode === "append" ? { ...current, ...savedDuplicates } : savedDuplicates);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "사진 저장에 실패했습니다.");
      }
    }
  };

  const classifyActivities = async (targetPhotos: Photo[] = photos): Promise<Record<number, Activity>> => {
    if (!targetPhotos.length) return {};
    setAnalysisMessage("사진 속 놀이 모습을 다시 분석하고 있어요…");
    const classifiedActivities: Record<number, Activity> = Object.fromEntries(
      targetPhotos.map((photo) => [photo.id, guessActivity(photo.name)]),
    );
    await mapWithConcurrency(targetPhotos, 4, async (photo) => {
      try {
        let response: Response;
        if (user && photo.persisted) {
          response = await fetch(`/api/photos/${photo.id}/classify`, {
            method: "POST",
            body: JSON.stringify({ force: true }),
            headers: { "Content-Type": "application/json" },
          });
        } else {
          const imageResponse = await fetch(photo.url);
          const blob = await imageResponse.blob();
          const form = new FormData();
          form.set("image", new File([blob], photo.name, { type: blob.type || "image/jpeg" }));
          form.set("name", photo.name);
          response = await fetch("/api/activity-classify", { method: "POST", body: form });
        }
        if (!response.ok) return;
        const result = await response.json() as { activity?: Activity };
        if (result.activity) classifiedActivities[photo.id] = result.activity;
      } catch {
        // Keep the filename-based suggestion when visual classification is unavailable.
      }
    });
    setActivityByPhoto((current) => ({ ...current, ...classifiedActivities }));
    setAnalysisMessage("놀이 활동별 분류를 다시 완료했어요.");
    return classifiedActivities;
  };

  const analyzeAll = async () => {
    if (!photos.length) return;
    setStage("analyzing");
    setProgress(4);
    setAnalysisMessage("얼굴 인식 모델을 준비하고 있어요.");

    const analyses: Array<{ photo: Photo; result: ImageAnalysis }> = [];
    try {
      await loadFaceModels();
      setAnalysisMessage("얼굴 특징과 흔들림, 밝기를 함께 살펴보고 있어요.");
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        analyses.push({ photo, result: await analyzeImage(photo.url) });
        setProgress(6 + Math.round(((index + 1) / photos.length) * 86));
      }
    } catch {
      setStage("upload");
      setMessage("얼굴 인식 모델을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
      return;
    }

    setAnalysisMessage("등록한 아이 얼굴과 비교해 분류하고 있어요.");
    const references = children.map((child) => ({ id: child.id, descriptor: child.descriptor }));
    const nextNames: Record<number, number> = {};
    const nextMatches: Record<number, number[]> = {};
    const nextQualities: Record<number, Quality> = {};
    const nextReasons: Record<number, string[]> = {};
    const nextScores: Record<number, number> = {};
    const nextShotTypes: Record<number, ShotType> = {};

    analyses.forEach(({ photo, result }, index) => {
      nextQualities[photo.id] = result.quality;
      nextReasons[photo.id] = result.reasons;
      nextScores[photo.id] = result.score;
      nextShotTypes[photo.id] = result.shotType;
      const recognized = Array.from(new Set(result.descriptors
        .map((descriptor) => closestChild(descriptor, references))
        .filter((match): match is FaceMatch => Boolean(match))
        .map((match) => match.id)));
      nextMatches[photo.id] = recognized;
      if (result.shotType === "individual" && recognized.length === 1) {
        nextNames[photo.id] = recognized[0];
      }
      setProgress(92 + Math.round(((index + 1) / analyses.length) * 7));
    });

    // The activity classifier analyzes the actual image. Do not replace its
    // result with the filename-based initial suggestion below.
    const classifiedActivities = await classifyActivities(photos);

    setQualities(nextQualities);
    setQualityReasons(nextReasons);
    setQualityScores(nextScores);
    setShotTypes(nextShotTypes);
    setNames(nextNames);
    setMatchedChildren(nextMatches);
    setActivityByPhoto(classifiedActivities);
    setSelected(photos.filter((photo) => nextQualities[photo.id] === "good").map((photo) => photo.id));
    const recognizedPhotoCount = Object.values(nextMatches).filter((ids) => ids.length > 0).length;
    setRecognitionMessage(children.length
      ? `${photos.length}장 중 ${recognizedPhotoCount}장에서 등록한 아이를 찾았어요. 단체 사진 속 아이도 아이별 정리에 함께 표시돼요.`
      : "등록한 아이가 없어 얼굴별 이름 분류는 건너뛰었어요.");
    setProgress(100);
    setAnalysisMessage("분류 제안을 준비했어요.");
    window.setTimeout(() => {
      setStage("workspace");
      setView("individual");
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

  const startDemo = () => {
    const demoPhotos = demoAreas.flatMap((activity, areaIndex) => Array.from({ length: 9 }, (_, cropIndex) => {
      const id = 9001 + areaIndex * 9 + cropIndex;
      const childId = demoPhotoChildIds[cropIndex];
      const isGroup = cropIndex === 2 || cropIndex === 5 || cropIndex === 8;
      return {
        id,
        name: `데모_${activity}_${String(cropIndex + 1).padStart(2, "0")}.png`,
        url: `/demo/photos/${demoPhotoFolders[areaIndex]}-${String(cropIndex + 1).padStart(2, "0")}.png`,
        childId,
        shotType: isGroup ? "group" as ShotType : "individual" as ShotType,
        activity,
      };
    }));
    const excluded = new Map<number, string[]>([
      [9007, ["초점이 흐려 추천에서 제외"]],
      [9017, ["화면 흔들림이 커 추천에서 제외"]],
      [9025, ["옆모습이 크게 보여 추천에서 제외"]],
      [9026, ["눈을 감은 장면으로 추천에서 제외"]],
      [9027, ["비슷한 장면의 중복 후보"]],
    ]);
    const nextQualities: Record<number, Quality> = {};
    const nextReasons: Record<number, string[]> = {};
    const nextScores: Record<number, number> = {};
    const nextShotTypes: Record<number, ShotType> = {};
    const nextNames: Record<number, number> = {};
    const nextMatches: Record<number, number[]> = {};
    const nextActivities: Record<number, Activity> = {};
    const nextDuplicates: Record<number, number> = {};
    demoPhotos.forEach((photo, index) => {
      const reasons = excluded.get(photo.id);
      nextQualities[photo.id] = reasons ? "bad" : "good";
      nextReasons[photo.id] = reasons ?? ["선명한 장면", photo.shotType === "group" ? "단체사진으로 분류" : "얼굴 특징과 일치"];
      nextScores[photo.id] = reasons ? 42 + (index % 3) * 4 : 89 + (index % 9);
      nextShotTypes[photo.id] = photo.shotType;
      nextActivities[photo.id] = photo.activity;
      nextMatches[photo.id] = photo.shotType === "group" ? [101, 102, 103] : [photo.childId];
      if (photo.shotType === "individual") nextNames[photo.id] = photo.childId;
      if (photo.id === 9027) nextDuplicates[photo.id] = 9024;
    });
    setDemoMode(true);
    setChildren(demoChildren);
    setPhotos(demoPhotos.map(({ childId: _childId, shotType: _shotType, activity: _activity, ...photo }) => photo));
    setQualities(nextQualities);
    setQualityReasons(nextReasons);
    setQualityScores(nextScores);
    setShotTypes(nextShotTypes);
    setNames(nextNames);
    setMatchedChildren(nextMatches);
    setActivityByPhoto(nextActivities);
    setSelected(demoPhotos.filter((photo) => !excluded.has(photo.id)).map((photo) => photo.id));
    setDuplicateOf(nextDuplicates);
    setBestByGroup({});
    setSessionId(null);
    setProgress(18);
    setAnalysisMessage("가상 사진 27장을 준비하고 있어요.");
    setRecognitionMessage("데모 결과예요. 가상 아동 3명, 개인·단체사진, 3개 놀이영역과 추천 제외사진을 확인해 보세요.");
    setStage("analyzing");
    window.setTimeout(() => {
      setProgress(100);
      setAnalysisMessage("품질과 분류 결과를 준비했어요.");
      window.setTimeout(() => { setStage("workspace"); setView("individual"); }, 350);
    }, 700);
  };

  const reset = async () => {
    if (demoMode) {
      setDemoMode(false);
      setPhotos([]);
      setChildren([]);
      setQualities({});
      setQualityReasons({});
      setQualityScores({});
      setShotTypes({});
      setNames({});
      setMatchedChildren({});
      setActivityByPhoto({});
      setSelected([]);
      setBestByGroup({});
      setDuplicateOf({});
      setRecognitionMessage("");
      setStage("landing");
      return;
    }
    if (user && sessionId) {
      try {
        const response = await fetch(`/api/photos?sessionId=${sessionId}`, { method: "DELETE" });
        if (!response.ok) throw new Error("저장된 사진을 삭제하지 못했어요.");
      } catch {
        setMessage("새 작업을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
    }
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setQualities({});
    setQualityReasons({});
    setQualityScores({});
    setShotTypes({});
    setNames({});
    setMatchedChildren({});
    setActivityByPhoto({});
    setSelected([]);
    setBestByGroup({});
    setSessionId(null);
    setDuplicateOf({});
    setRecognitionMessage("");
    setStage("upload");
    setView("individual");
    setMessage("아이 얼굴을 설정하고 오늘 찍은 사진을 올려 주세요.");
  };

  useEffect(() => {
    if (!user || !sessionId || !photos.length || photos.some((photo) => !photo.persisted)) return;
    const timer = window.setTimeout(() => {
      const payload = photos.map((photo) => {
        const key = bestKey(photo, shotTypes, names, activityByPhoto, children);
        return {
          id: photo.id,
          quality: qualities[photo.id],
          reasons: qualityReasons[photo.id] ?? [],
          score: qualityScores[photo.id],
          shotType: shotTypes[photo.id],
          childId: names[photo.id],
          matchedChildIds: matchedChildren[photo.id] ?? [],
          activity: activityByPhoto[photo.id],
          selected: selected.includes(photo.id),
          bestKey: key,
          isBest: (bestByGroup[key] ?? groupedCandidates[key]?.[0]?.id) === photo.id,
          duplicateOf: duplicateOf[photo.id],
          isDuplicate: Boolean(duplicateOf[photo.id]),
        };
      });
      void fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, goals, photos: payload }),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [user, sessionId, photos, qualities, qualityReasons, qualityScores, shotTypes, names, matchedChildren, activityByPhoto, selected, bestByGroup, goals, children, groupedCandidates, duplicateOf]);

  const downloadList = () => {
    const header = "선택\t품질\t사진구분\t아이\t인식된 아이\t놀이영역\t베스트\t파일명";
    const rows = goodPhotos.map((photo) => {
      const child = children.find((item) => item.id === names[photo.id]);
      const key = bestKey(photo, shotTypes, names, activityByPhoto, children);
      const recognized = (matchedChildren[photo.id] ?? [])
        .map((id) => children.find((item) => item.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      return [
        selected.includes(photo.id) ? "선택" : "미선택",
        "잘 나온 사진",
        shotTypes[photo.id] === "group" ? "단체" : "개인",
        shotTypes[photo.id] === "group" ? "단체" : child?.name ?? "미분류",
        recognized || "미인식",
        activityByPhoto[photo.id] ?? "미분류",
        (bestByGroup[key] ?? groupedCandidates[key]?.[0]?.id) === photo.id ? "베스트" : "",
        photo.name,
      ].join("\t");
    });
    downloadText(`\uFEFF${[header, ...rows].join("\n")}`, "사진-분류-결과.tsv");
  };

  const downloadPhotoArchive = async (scope: ExportScope) => {
    const header = "선택\t품질\t사진구분\t아이\t인식된 아이\t놀이영역\t베스트\t파일명";
    const scopedPhotos = selectedGoodPhotos.filter((photo) => {
      if (scope.type === "child") return shotTypes[photo.id] === "individual" && names[photo.id] === scope.childId;
      if (scope.type === "group") return shotTypes[photo.id] === "group";
      return true;
    });
    const scopedChild = scope.type === "child" ? children.find((child) => child.id === scope.childId) : null;
    const archiveName = scope.type === "child"
      ? `${safeFilename(scopedChild?.name ?? "아이")}-개인사진.zip`
      : scope.type === "group" ? "단체사진.zip" : "사진-분류-결과.zip";
    const archived = await Promise.all(scopedPhotos.map(async (photo, index) => {
      const type = shotTypes[photo.id] ?? "individual";
      const child = children.find((item) => item.id === names[photo.id]);
      const owner = type === "group" ? "단체" : child?.name ?? "아이 미분류";
      const activity = activityByPhoto[photo.id] ?? "미분류";
      const key = bestKey(photo, shotTypes, names, activityByPhoto, children);
      const isBest = (bestByGroup[key] ?? groupedCandidates[key]?.[0]?.id) === photo.id;
      const recognized = (matchedChildren[photo.id] ?? [])
        .map((id) => children.find((item) => item.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      const row = ["선택", "잘 나온 사진", type === "group" ? "단체" : "개인", owner, recognized || "미인식", activity, isBest ? "베스트" : "", photo.name].join("\t");
      const response = await fetch(photo.url);
      if (!response.ok) throw new Error(`${photo.name} 사진을 읽지 못했어요.`);
      const data = new Uint8Array(await response.arrayBuffer());
      const folder = type === "group" ? `단체/${activity}` : `개인/${owner}/${activity}`;
      return {
        row,
        entry: { name: `${safePath(folder)}/${String(index + 1).padStart(3, "0")}_${safeFilename(photo.name)}`, data },
      };
    }));
    const entries = archived.map(({ entry }) => entry);
    entries.unshift({
      name: "사진-분류-결과.tsv",
      data: new TextEncoder().encode(`\uFEFF${[header, ...archived.map(({ row }) => row)].join("\n")}`),
    });
    downloadBlob(createStoredZip(entries), archiveName);
  };

  return (
    <main className="shell">
      <header className="masthead">
        <button className="brand brand-button" onClick={() => setStage("landing")}>사진 고르기 <span>✦</span></button>
        <div className="account-actions">
          {stage !== "landing" && <button className="account-link home-link" onClick={() => setStage("landing")}>홈</button>}
          {demoMode && <button className="home-button" onClick={startDemo}>데모 초기화</button>}
          {demoMode && <button className="account-link home-link" onClick={reset}>데모 처음으로</button>}
          {photos.length > 0 && !demoMode && <button className="home-button" onClick={reset}>새 작업</button>}
          {sessionLoaded && (user ? (
            <>
              <span className="account-email">{user.email ?? "로그인됨"}</span>
              <a className="account-link" href="/signout-with-chatgpt?return_to=/">로그아웃</a>
            </>
          ) : <a className="account-link primary-account" href="/signin-with-chatgpt?return_to=/">로그인해 아이 저장</a>)}
        </div>
      </header>

      {stage === "landing" && <LandingPage user={user} onTry={() => setStage("upload")} onDemo={startDemo} />}

      {stage !== "landing" && stage !== "analyzing" && (
        <nav className="app-nav workflow-nav" aria-label="사진 정리 단계">
          <button aria-current={stage === "upload" ? "step" : undefined} className={stage === "upload" ? "active" : ""} onClick={() => setStage("upload")}>1 아이 등록·사진 업로드</button>
          <button aria-current={stage === "workspace" && view === "individual" ? "step" : undefined} className={stage === "workspace" && view === "individual" ? "active" : ""} disabled={!photos.length} onClick={() => openWorkspaceView("individual")}>2 개인사진</button>
          <button aria-current={stage === "workspace" && view === "group" ? "step" : undefined} className={stage === "workspace" && view === "group" ? "active" : ""} disabled={!photos.length} onClick={() => openWorkspaceView("group")}>3 단체사진</button>
          <button aria-current={stage === "workspace" && view === "export" ? "step" : undefined} className={stage === "workspace" && view === "export" ? "active" : ""} disabled={!photos.length} onClick={() => openWorkspaceView("export")}>4 결과 저장</button>
        </nav>
      )}

      {stage === "upload" && (
        <UploadStage
          photos={photos}
          duplicateCount={Object.keys(duplicateOf).length}
          children={children}
          childName={childName}
          childPhoto={childPhoto}
          message={message}
          isRegisteringChild={isRegisteringChild}
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
          <div className="analysis-box" role="status" aria-live="polite" aria-busy={progress < 100}>
            <strong>{progress}% 확인했어요</strong>
            <div className="bar"><span style={{ width: `${progress}%` }} /></div>
            <p>{analysisMessage}</p>
          </div>
          <PhotoStrip photos={photos.slice(0, 8)} />
        </section>
      )}

      {stage === "workspace" && (
        <section className="workspace-page">
          <p className="eyebrow">{demoMode ? "데모 사진 체험 · " : ""}{view === "individual" ? "2 개인사진" : view === "group" ? "3 단체사진" : "4 결과 저장"} · {viewLabels[view]}</p>
          {recognitionMessage && <div className="recognition-summary"><span>얼굴 인식</span>{recognitionMessage}</div>}
          {view === "individual" && <SimplePhotoReview photos={goodPhotos} excluded={photos.filter((photo) => qualities[photo.id] === "bad" || Boolean(duplicateOf[photo.id]))} children={children} shotTypes={shotTypes} names={names} matchedChildren={matchedChildren} qualityReasons={qualityReasons} setNames={setNames} activityByPhoto={activityByPhoto} setActivityByPhoto={setActivityByPhoto} selected={selected} toggleSelected={toggleSelected} setQuality={setQuality} restorePhoto={(id) => { setDuplicateOf((current) => { const next = { ...current }; delete next[id]; return next; }); setQuality(id, "good"); }} saveChild={(childId) => downloadPhotoArchive({ type: "child", childId })} />}
          {view === "group" && <SimpleGroupReview photos={goodPhotos} children={children} shotTypes={shotTypes} matchedChildren={matchedChildren} activityByPhoto={activityByPhoto} setActivityByPhoto={setActivityByPhoto} selected={selected} toggleSelected={toggleSelected} />}
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

      <footer><span>사진 고르기</span><span>아이별로, 놀이별로 사진 정리</span></footer>
    </main>
  );
}

function LandingPage({ user, onTry, onDemo }: { user: SessionUser | null; onTry: () => void; onDemo: () => void }) {
  return (
    <section className="landing-page">
      <div className="landing-hero-grid">
      <div className="landing-hero">
        <p className="eyebrow">보육 사진 정리 도구</p>
        <h1>아이별로 모으고<br /><em>놀이별로 정리해요.</em></h1>
        <p className="landing-lede">사진을 올리면 좋은 장면만 골라 아이와 놀이영역별로 정리하고, 필요한 사진을 바로 저장할 수 있어요.</p>
        <p className="landing-quit-message">선생님, 사진 정리는 맡겨두고 오늘은 칼퇴하세요.</p>
        <div className="landing-actions">
          <button className="primary" onClick={onTry}>로그인 없이 먼저 사용해 보기 <span>→</span></button>
          <button className="secondary demo-start" onClick={onDemo}>데모 사진으로 체험하기</button>
          {!user && <a className="secondary landing-login" href="/signin-with-chatgpt?return_to=/">로그인하고 아이 정보 저장하기</a>}
          {user && <span className="landing-signed-in">{user.email ?? "로그인됨"}으로 로그인되어 있어요.</span>}
        </div>
        <p className="landing-note">데모는 가상의 아동 3명과 예시 사진 27장으로 구성되며, 실제 아이 사진이나 저장된 데이터는 사용하지 않아요.</p>
      </div>
      <div className="landing-preview" aria-label="아이별 사진 정리 미리보기">
        <div className="preview-window-top"><span></span><span></span><span></span><b>개인사진</b></div>
        <div className="preview-child"><div className="preview-child-title"><span className="preview-avatar">민</span><strong>민서</strong><small>18장 · 12장 저장 선택</small><em>저장하기</em></div><div className="preview-activity"><b>미술놀이</b><div><i></i><i></i><i></i></div></div><div className="preview-activity"><b>신체활동</b><div><i></i><i></i></div></div></div>
        <div className="preview-child second"><div className="preview-child-title"><span className="preview-avatar blue">준</span><strong>준호</strong><small>15장 · 10장 저장 선택</small><em>저장하기</em></div><div className="preview-activity"><b>언어영역</b><div><i></i><i></i><i></i></div></div></div>
      </div>
      </div>
      <div className="landing-features">
        <article><span>01</span><strong>아이를 먼저 등록해요</strong><p>대표사진과 이름을 등록하면 사진 속 아이를 자동으로 찾아요.</p></article>
        <article><span>02</span><strong>사진을 올리면 나눠줘요</strong><p>개인사진과 단체사진을 구분하고, 놀이영역까지 정리해요.</p></article>
        <article><span>03</span><strong>좋은 사진만 골라요</strong><p>흔들림·흐림·중복 사진은 걸러내고, 상반신 사진은 그대로 남겨요.</p></article>
        <article><span>04</span><strong>원하는 방식으로 저장해요</strong><p>아이별·놀이별·단체사진을 필요한 만큼 나눠 저장할 수 있어요.</p></article>
      </div>
      <div className="landing-flow"><span>아이 등록</span><b>→</b><span>사진 업로드</span><b>→</b><span>개인·단체 정리</span><b>→</b><span>저장</span></div>
    </section>
  );
}

function PhotoImage({ photo, alt }: { photo: Photo; alt: string }) {
  return <img src={photo.url} alt={alt} />;
}

function SimplePhotoReview(props: {
  photos: Photo[];
  excluded: Photo[];
  children: Child[];
  shotTypes: Record<number, ShotType>;
  names: Record<number, number>;
  matchedChildren: Record<number, number[]>;
  qualityReasons: Record<number, string[]>;
  activityByPhoto: Record<number, Activity>;
  setNames: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
  selected: number[];
  toggleSelected: (id: number) => void;
  setQuality: (id: number, quality: Quality) => void;
  restorePhoto: (id: number) => void;
  saveChild: (childId: number) => Promise<void>;
}) {
  const [childFilter, setChildFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState<Activity | "all">("all");
  const individual = props.photos.filter((photo) => props.shotTypes[photo.id] !== "group");
  const [savingChild, setSavingChild] = useState<number | null>(null);
  const visible = individual.filter((photo) => (childFilter === "all" || (childFilter === "unassigned" ? !props.names[photo.id] : String(props.names[photo.id] ?? "") === childFilter)) && (activityFilter === "all" || (props.activityByPhoto[photo.id] ?? "미분류") === activityFilter));
  const childSections = [...props.children.map((child) => ({ child, photos: visible.filter((photo) => props.names[photo.id] === child.id) })), { child: null, photos: visible.filter((photo) => !props.names[photo.id]) }];
  const saveChild = async (childId: number) => { setSavingChild(childId); try { await props.saveChild(childId); } finally { setSavingChild(null); } };
  return (
    <>
      <div className="simple-heading"><div><h1>아이별로 사진을 한눈에 정리해요.</h1><p className="page-lede">아이마다 놀이영역별로 사진을 모아 보여드려요. 사진 아래 드롭다운에서 분류를 바로 수정할 수 있어요.</p></div><span className="count-badge">{visible.length}장</span></div>
      <div className="summary-ribbon"><span><b>{individual.length}</b>장 개인사진</span><span className="good"><b>{individual.filter((photo) => props.selected.includes(photo.id)).length}</b>장 저장 선택</span><span className="bad"><b>{props.excluded.length}</b>장 자동 제외</span></div>
      <div className="simple-filters"><select aria-label="아이 필터" value={childFilter} onChange={(event) => setChildFilter(event.target.value)}><option value="all">모든 아이</option><option value="unassigned">아이 미분류</option>{props.children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}</select><select aria-label="놀이영역 필터" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as Activity | "all")}><option value="all">모든 놀이영역</option>{activities.map((activity) => <option value={activity} key={activity}>{activity}</option>)}</select></div>
      <div className="child-scroll-list">{childSections.filter((section) => section.photos.length > 0 || section.child).map(({ child, photos: childPhotos }) => { const childId = child?.id ?? 0; const chosen = childPhotos.filter((photo) => props.selected.includes(photo.id)).length; const grouped = activities.map((activity) => ({ activity, photos: childPhotos.filter((photo) => (props.activityByPhoto[photo.id] ?? "미분류") === activity) })).filter((group) => group.photos.length); const recommendedExcluded = child ? props.excluded.filter((photo) => props.names[photo.id] === child.id || props.matchedChildren[photo.id]?.includes(child.id)) : props.excluded.filter((photo) => !props.names[photo.id] && !(props.matchedChildren[photo.id]?.length)); return <section className="child-section-card" key={childId}><div className="child-section-heading">{child ? <div className="child-section-identity"><PhotoImage photo={child} alt={`${child.name} 대표 얼굴`} /><div><h2>{child.name} {recommendedExcluded.length > 0 && <small className="excluded-count">추천 제외사진 {recommendedExcluded.length}장</small>}</h2><span>{childPhotos.length}장 · {chosen}장 저장 선택</span></div></div> : <div className="child-section-identity"><div className="unassigned-avatar">?</div><div><h2>아이 미분류</h2><span>{childPhotos.length}장</span></div></div>}{child && <button className="secondary child-save-button" disabled={!chosen || savingChild !== null} onClick={() => void saveChild(child.id)}>{savingChild === child.id ? "저장 중…" : "저장하기"}</button>}</div><div className="child-activity-row">{grouped.map((group) => <div className="child-activity-column" key={group.activity}><div className="child-activity-heading"><strong>{group.activity}</strong><span>{group.photos.length}장</span></div><div className="child-photo-strip">{group.photos.map((photo) => { const picked = props.selected.includes(photo.id); return <article className={`simple-photo-card ${picked ? "picked" : ""}`} key={photo.id}><button className="simple-photo-button" onClick={() => props.toggleSelected(photo.id)}><PhotoImage photo={photo} alt={photo.name} /><span>{picked ? "✓ 저장" : "제외"}</span></button><div className="simple-photo-fields"><select aria-label={`${photo.name} 아이 선택`} value={props.names[photo.id] ?? ""} onChange={(event) => props.setNames((current) => ({ ...current, [photo.id]: Number(event.target.value) }))}><option value="">아이 미분류</option>{props.children.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select aria-label={`${photo.name} 놀이영역 선택`} value={props.activityByPhoto[photo.id] ?? "미분류"} onChange={(event) => props.setActivityByPhoto((current) => ({ ...current, [photo.id]: event.target.value as Activity }))}>{activities.map((activity) => <option value={activity} key={activity}>{activity}</option>)}</select></div></article>; })}</div></div>)}</div>{recommendedExcluded.length > 0 && <RecommendedExcludedPhotos photos={recommendedExcluded} reasons={props.qualityReasons} restorePhoto={props.restorePhoto} />}</section>; })}</div>
      {props.excluded.length > 0 && <details className="excluded-panel"><summary>자동 제외된 사진 {props.excluded.length}장 확인</summary><p>흔들림, 초점, 중복 또는 사진 가장자리의 과도한 잘림을 기준으로 기본 결과에서 제외했어요. 상반신 사진은 제외하지 않습니다.</p><div className="excluded-grid">{props.excluded.map((photo) => <article key={photo.id}><PhotoImage photo={photo} alt={photo.name} /><button onClick={() => props.restorePhoto(photo.id)}>결과에 포함</button></article>)}</div></details>}
    </>
  );
}

function RecommendedExcludedPhotos({ photos, reasons, restorePhoto }: { photos: Photo[]; reasons: Record<number, string[]>; restorePhoto: (id: number) => void }) {
  return (
    <details className="child-excluded-panel">
      <summary>추천 제외사진 {photos.length}장 보기</summary>
      <p>흐림·흔들림, 뒷모습·측면, 눈감음처럼 기록용으로 덜 적합한 사진이에요. 필요하면 다시 결과에 포함할 수 있어요.</p>
      <div className="child-excluded-grid">
        {photos.map((photo) => <article key={photo.id}><PhotoImage photo={photo} alt={photo.name} /><small>{(reasons[photo.id] ?? ["자동 제외"]).join(" · ")}</small><button onClick={() => restorePhoto(photo.id)}>결과에 포함</button></article>)}
      </div>
    </details>
  );
}

function SimpleGroupReview(props: {
  photos: Photo[];
  children: Child[];
  shotTypes: Record<number, ShotType>;
  matchedChildren: Record<number, number[]>;
  activityByPhoto: Record<number, Activity>;
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
  selected: number[];
  toggleSelected: (id: number) => void;
}) {
  const [activityFilter, setActivityFilter] = useState<Activity | "all">("all");
  const groups = props.photos.filter((photo) => props.shotTypes[photo.id] === "group").filter((photo) => activityFilter === "all" || (props.activityByPhoto[photo.id] ?? "미분류") === activityFilter);
  return <><div className="simple-heading"><div><h1>단체사진을 모아 저장해요.</h1><p className="page-lede">단체사진은 놀이영역만 확인하고, 필요한 사진을 선택하세요.</p></div><span className="count-badge">{groups.length}장</span></div><div className="simple-filters"><select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as Activity | "all")}><option value="all">모든 놀이영역</option>{activities.map((activity) => <option value={activity} key={activity}>{activity}</option>)}</select></div><div className="simple-photo-grid">{groups.map((photo) => { const picked = props.selected.includes(photo.id); const recognized = (props.matchedChildren[photo.id] ?? []).map((id) => props.children.find((child) => child.id === id)?.name).filter(Boolean).join(", "); return <article className={`simple-photo-card ${picked ? "picked" : ""}`} key={photo.id}><button className="simple-photo-button" onClick={() => props.toggleSelected(photo.id)}><PhotoImage photo={photo} alt={photo.name} /><span>{picked ? "✓ 저장 선택" : "결과에서 제외"}</span></button><div className="simple-photo-fields"><strong>단체사진</strong>{recognized && <small>참여 아이: {recognized}</small>}<select value={props.activityByPhoto[photo.id] ?? "미분류"} onChange={(event) => props.setActivityByPhoto((current) => ({ ...current, [photo.id]: event.target.value as Activity }))}>{activities.map((activity) => <option value={activity} key={activity}>{activity}</option>)}</select></div></article>; })}</div>{!groups.length && <div className="empty-state">단체사진이 아직 없어요.</div>}</>;
}

function UploadStage(props: {
  photos: Photo[];
  duplicateCount: number;
  children: Child[];
  childName: string;
  childPhoto: File | null;
  message: string;
  isRegisteringChild: boolean;
  setChildName: (value: string) => void;
  setChildPhoto: (value: File | null) => void;
  addChild: () => Promise<void>;
  removeChild: (id: number) => Promise<void>;
  pickPhotos: (event: ChangeEvent<HTMLInputElement>, mode: "replace" | "append") => void;
  analyzeAll: () => Promise<void>;
}) {
  return (
    <section className="upload-page">
      <div className="intro">
        <p className="eyebrow">보육 사진 정리</p>
        <h1>아이별로 모으고<br /><em>놀이별로 정리해요.</em></h1>
        <p>아이 얼굴을 먼저 설정하면, 업로드한 사진에서 잘 나온 장면을 고르고 아이·활동별로 정리해요.</p>
      </div>

      <section className="soft-card children-card setup-card">
        <Title num="1" title="아이 얼굴과 이름 설정" note="한 아이만 나온 선명한 얼굴 사진을 올려 주세요" />
        <div className="child-form">
          <input aria-label="아이 이름" value={props.childName} onChange={(event) => props.setChildName(event.target.value)} placeholder="아이 이름" />
          <label className="child-file">
            <input aria-label="설정 얼굴 사진" type="file" accept="image/jpeg,image/png" onChange={(event) => props.setChildPhoto(event.target.files?.[0] ?? null)} />
            {props.childPhoto ? props.childPhoto.name : "선명한 얼굴 사진 선택"}
          </label>
          <button disabled={props.isRegisteringChild} onClick={() => void props.addChild()}>
            {props.isRegisteringChild ? "얼굴 확인 중…" : "아이 추가"}
          </button>
        </div>
        {props.children.length ? (
          <div className="child-list child-setup-list">
            {props.children.map((child, index) => (
              <div className="child-chip" key={child.id}>
                <b className="child-number">{index + 1}</b>
                <img src={child.url} alt={`${child.name} 대표 얼굴`} />
                <span>{child.name}</span>
                <button onClick={() => void props.removeChild(child.id)} aria-label={`${child.name} 삭제`}>×</button>
              </div>
            ))}
          </div>
        ) : <p className="helper setup-helper">얼굴 전체가 밝고 선명하게 보이는 사진을 골라 주세요. 모자·마스크·손으로 얼굴을 가리거나 여러 명이 함께 나온 사진은 피하는 것이 좋아요.</p>}
      </section>

      <section className="soft-card upload-card">
        <Title num="2" title="사진 업로드" note="JPG · PNG / 최대 100장" />
        <label className="drop-zone">
          <input aria-label="사진 업로드" type="file" accept="image/jpeg,image/png" multiple onChange={(event) => props.pickPhotos(event, "replace")} />
          <span className="upload-icon">↑</span>
          <strong>사진 업로드하기</strong>
          <small>{props.photos.length ? "새 사진 묶음으로 현재 목록을 교체해요." : "사진을 끌어 놓거나 선택해 주세요."}</small>
        </label>
        {props.photos.length > 0 && (
          <>
            <label className="append-upload">
              <input aria-label="추가 사진 업로드" type="file" accept="image/jpeg,image/png" multiple onChange={(event) => props.pickPhotos(event, "append")} />
              <span>＋</span><strong>추가 사진 업로드하기</strong><small>기존 {props.photos.length}장은 유지돼요.</small>
            </label>
            <PhotoStrip photos={props.photos} />
          </>
        )}
      </section>

      <div className="flow-footer">
        <span role="status" aria-live="polite">{props.duplicateCount ? `${props.message} 중복 사진 ${props.duplicateCount}장은 결과에서 자동 제외됩니다.` : props.message}</span>
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
  mode: "individual" | "group";
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
      <h1>{props.mode === "individual" ? <>아이별 좋은 장면을<br /><em>빠르게 골라요.</em></> : <>단체 사진만 모아<br /><em>베스트를 골라요.</em></>}</h1>
      <p className="page-lede">{props.mode === "individual" ? "아이와 놀이영역별로 품질 점수가 높은 개인사진을 먼저 추천해요." : "아이 수와 관계없이 단체사진만 따로 모아 놀이영역별 베스트를 확인해요."}</p>
      {props.mode === "individual"
        ? renderSection("개인 사진 베스트", "아이와 놀이영역별로 가장 좋은 사진을 추천해요.", individualEntries)
        : renderSection("단체 사진 베스트", "놀이영역별 단체 사진 가운데 가장 좋은 장면을 추천해요.", groupEntries)}
    </>
  );
}

function ByChild(props: {
  photos: Photo[];
  children: Child[];
  shotTypes: Record<number, ShotType>;
  names: Record<number, number>;
  activityByPhoto: Record<number, Activity>;
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
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
          const activityGroups = activities
            .map((activity) => ({ activity, photos: childPhotos.filter((photo) => (props.activityByPhoto[photo.id] ?? "미분류") === activity) }))
            .filter((group) => group.photos.length > 0);
          return (
            <section className="soft-card child-detail-card" key={child.id}>
              <div className="child-heading large">
                <img src={child.url} alt={`${child.name} 대표 얼굴`} />
                <div><strong>{child.name}</strong><small>선택 {picked}장 · 개인사진 {childPhotos.length}장</small></div>
              </div>
              <ActivitySummary photos={childPhotos} activityByPhoto={props.activityByPhoto} />
              <div className="child-activity-sections">
                {activityGroups.map((group) => (
                  <section key={group.activity}>
                    <div className="activity-section-title"><strong>{group.activity}</strong><span>{group.photos.length}장</span></div>
                    <ActivityPhotoGrid photos={group.photos} selected={props.selected} toggleSelected={props.toggleSelected} activityByPhoto={props.activityByPhoto} setActivityByPhoto={props.setActivityByPhoto} />
                  </section>
                ))}
                {!activityGroups.length && <p className="helper">분류된 개인사진이 아직 없어요.</p>}
              </div>
            </section>
          );
        })}
      </div>
      {!props.children.length && <div className="empty-state">아이 설정에서 이름과 대표 얼굴을 먼저 추가해 주세요.</div>}
    </>
  );
}

function ActivityOrganization(props: {
  photos: Photo[];
  shotTypes: Record<number, ShotType>;
  activityByPhoto: Record<number, Activity>;
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
  reclassify: () => void;
  selected: number[];
  toggleSelected: (id: number) => void;
}) {
  const individualPhotos = props.photos.filter((photo) => props.shotTypes[photo.id] === "individual");
  const groups = activities
    .map((activity) => ({ activity, photos: individualPhotos.filter((photo) => (props.activityByPhoto[photo.id] ?? "미분류") === activity) }))
    .filter((group) => group.photos.length > 0);
  return (
    <>
      <h1>아이 이름과 관계없이<br /><em>활동별로 모아봐요.</em></h1>
      <p className="page-lede">모든 개인사진을 아이 이름 대신 선택한 활동만 기준으로 분류해요. 활동을 바꾸면 사진이 해당 구역으로 바로 이동해요.</p>
      <div className="page-actions"><button className="secondary" onClick={props.reclassify}>사진 속 놀이 모습으로 다시 분류</button></div>
      <div className="activity-organize-list">
        {groups.map((group) => (
          <section className="soft-card activity-organize-card" key={group.activity}>
            <div className="activity-section-title large"><strong>{group.activity}</strong><span>{group.photos.length}장</span></div>
            <ActivityPhotoGrid photos={group.photos} selected={props.selected} toggleSelected={props.toggleSelected} activityByPhoto={props.activityByPhoto} setActivityByPhoto={props.setActivityByPhoto} />
          </section>
        ))}
      </div>
      {!individualPhotos.length && <div className="empty-state">분류된 개인사진이 아직 없어요.</div>}
    </>
  );
}

function GroupOrganization(props: {
  photos: Photo[];
  children: Child[];
  shotTypes: Record<number, ShotType>;
  matchedChildren: Record<number, number[]>;
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
              {list.map((photo) => {
                const recognizedNames = (props.matchedChildren[photo.id] ?? [])
                  .map((id) => props.children.find((child) => child.id === id)?.name)
                  .filter((name): name is string => Boolean(name));
                return (
                  <article className={props.selected.includes(photo.id) ? "picked" : ""} key={photo.id}>
                    <img src={photo.url} alt={photo.name} />
                    {recognizedNames.length > 0 && <div className="face-match-tags">{recognizedNames.map((name) => <span key={name}>✓ {name}</span>)}</div>}
                    <select value={props.activityByPhoto[photo.id] ?? "미분류"} onChange={(event) => props.setActivityByPhoto((current) => ({ ...current, [photo.id]: event.target.value as Activity }))}>
                      {activities.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                    <button className={`select-row ${props.selected.includes(photo.id) ? "checked" : ""}`} onClick={() => props.toggleSelected(photo.id)}>
                      {props.selected.includes(photo.id) ? "✓ 결과 포함" : "결과 제외"}
                    </button>
                  </article>
                );
              })}
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
  downloadPhotoArchive: (scope: ExportScope) => Promise<void>;
}) {
  const chosen = props.photos.filter((photo) => props.selected.includes(photo.id));
  const sections = groupForExport(chosen, props.shotTypes, props.names, props.activityByPhoto, props.children);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const groupCount = chosen.filter((photo) => props.shotTypes[photo.id] === "group").length;
  const savePhotos = async (scope: ExportScope, key: string) => {
    setSavingKey(key);
    setSaveError("");
    try {
      await props.downloadPhotoArchive(scope);
    } catch {
      setSaveError("사진을 묶지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSavingKey(null);
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
          <button className="primary" disabled={!chosen.length || savingKey !== null} onClick={() => void savePhotos({ type: "all" }, "all")}>{savingKey === "all" ? "사진을 묶는 중…" : "전체 사진 저장"}</button>
        </div>
      </div>
      <p className="export-note">전체 ZIP 외에도 아이별 개인사진과 단체사진을 각각 별도 ZIP으로 저장할 수 있어요.</p>
      {saveError && <p className="export-error" role="alert">{saveError}</p>}
      <section className="scope-export-panel">
        <div className="scope-export-heading"><strong>나누어 저장하기</strong><span>결과에 포함한 사진 기준</span></div>
        <div className="scope-export-grid">
          {props.children.map((child) => {
            const count = chosen.filter((photo) => props.shotTypes[photo.id] === "individual" && props.names[photo.id] === child.id).length;
            const key = `child-${child.id}`;
            return (
              <article key={child.id}>
                <img src={child.url} alt={`${child.name} 대표 얼굴`} />
                <div><strong>{child.name}</strong><span>개인사진 {count}장</span></div>
                <button disabled={!count || savingKey !== null} onClick={() => void savePhotos({ type: "child", childId: child.id }, key)}>{savingKey === key ? "저장 중…" : "아이별 저장"}</button>
              </article>
            );
          })}
          <article className="group-scope-card">
            <div className="group-scope-icon">단체</div>
            <div><strong>단체사진</strong><span>선택 {groupCount}장</span></div>
            <button disabled={!groupCount || savingKey !== null} onClick={() => void savePhotos({ type: "group" }, "group")}>{savingKey === "group" ? "저장 중…" : "단체별 저장"}</button>
          </article>
        </div>
      </section>
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
  return <div className="upload-preview"><div className="preview-head"><strong>선택한 사진</strong><span>{photos.length}장</span></div><div className="thumbnail-row">{photos.slice(0, 10).map((photo) => <PhotoImage key={photo.id} photo={photo} alt={photo.name} />)}</div></div>;
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

function ActivityPhotoGrid(props: {
  photos: Photo[];
  selected: number[];
  toggleSelected: (id: number) => void;
  activityByPhoto: Record<number, Activity>;
  setActivityByPhoto: React.Dispatch<React.SetStateAction<Record<number, Activity>>>;
}) {
  return (
    <div className="activity-photo-grid">
      {props.photos.map((photo) => {
        const picked = props.selected.includes(photo.id);
        return (
          <article className={picked ? "is-selected" : ""} key={photo.id}>
            <button className="activity-photo-button" onClick={() => props.toggleSelected(photo.id)} aria-pressed={picked}>
              <img src={photo.url} alt={photo.name} />
              <span>{picked ? "✓ 선택됨" : "선택하기"}</span>
            </button>
            <select
              aria-label={`${photo.name} 활동 선택`}
              value={props.activityByPhoto[photo.id] ?? "미분류"}
              onChange={(event) => props.setActivityByPhoto((current) => ({ ...current, [photo.id]: event.target.value as Activity }))}
            >
              {activities.map((activity) => <option value={activity} key={activity}>{activity}</option>)}
            </select>
          </article>
        );
      })}
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

function legacyGuessActivity(name: string): string {
  const lowered = name.toLowerCase();
  if (/신체|체육|운동|바깥|산책/.test(lowered)) return "신체";
  if (/미술|그림|물감|만들기|점토/.test(lowered)) return "미술";
  if (/감각|과학|실험|관찰|자연/.test(lowered)) return "감각·과학";
  if (/수조작|수학|퍼즐|블록|조작/.test(lowered)) return "수·조작";
  if (/음률|음악|노래|악기|율동/.test(lowered)) return "음률";
  return "미분류";
}

function guessActivity(name: string): Activity {
  const lowered = name.toLowerCase().replace(/[\s_-]/g, "");
  if (/바깥|실외|산책|놀이터/.test(lowered)) return "실외놀이";
  if (/신체|체육|운동|달리기/.test(lowered)) return "신체활동";
  if (/미술|그림|물감|만들기|공작|색칠|그리기|클레이/.test(lowered)) return "미술놀이";
  if (/음률|음악|노래|악기|리듬|동요|율동/.test(lowered)) return "음률";
  if (/역할|병원놀이|가게놀이|소꿉|인형놀이|극놀이/.test(lowered)) return "역할놀이";
  if (/언어|동화|책|읽기|말하기|이야기|글자|낱말|동시/.test(lowered)) return "언어영역";
  if (/수조작|수학|퍼즐|블록|조립|분류|수세기|보드게임/.test(lowered)) return "수·조작영역";
  if (/감각|탐구|과학|실험|관찰|자연|요리|모래|물놀이|촉감/.test(lowered)) return "감각·탐구영역";
  return "미분류";
}

async function mapWithConcurrency<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function detectDuplicatePhotos(next: Photo[], existing: Photo[]) {
  const all = [...existing, ...next];
  const fingerprints = await Promise.all(all.map(async (photo) => ({
    id: photo.id,
    exact: await exactImageHash(photo.url),
    visual: await perceptualImageHash(photo.url),
  })));
  const matches: Record<number, number> = {};
  next.forEach((photo) => {
    const current = fingerprints.find((item) => item.id === photo.id);
    if (!current) return;
    const previous = fingerprints.slice(0, fingerprints.indexOf(current)).find((item) =>
      item.exact === current.exact || hammingDistance(item.visual, current.visual) <= 5,
    );
    if (previous) matches[photo.id] = previous.id;
  });
  return matches;
}

async function exactImageHash(url: string) {
  const response = await fetch(url);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function perceptualImageHash(url: string) {
  const image = await loadImage(url);
  if (!image) return "";
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  const values = Array.from({ length: size * size }, (_, index) => {
    const pixel = index * 4;
    return data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114;
  });
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value >= average ? "1" : "0").join("");
}

function hammingDistance(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

async function analyzeImage(url: string): Promise<ImageAnalysis> {
  const image = await loadImage(url);
  if (!image) return { quality: "bad", reasons: ["사진을 읽지 못함"], shotType: "individual", descriptors: [], score: 0 };
  const faceResults = await describeFaces(image);
  const faces = faceResults.map((result) => result.box);
  const canvas = document.createElement("canvas");
  const size = 120;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { quality: "good", reasons: ["직접 확인 권장"], shotType: faces.length > 1 ? "group" : "individual", descriptors: faceResults.map((result) => result.descriptor), score: 65 };
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
  if (!faces.length) reasons.push("얼굴을 찾지 못함 (뒷모습·얼굴 가림 가능성)");
  if (sharpness < 0.065) reasons.push("초점이 흐리거나 흔들림");
  if (brightness < 0.2) reasons.push("사진이 어두움");
  if (brightness > 0.88) reasons.push("사진이 너무 밝음");
  if (edgeDensity > 0.34) reasons.push("배경이 복잡해 보임");
  const individualFace = faceResults.length === 1 ? faceResults[0] : null;
  if (individualFace && individualFace.frontalness < 0.55) reasons.push("옆을 바라보거나 측면 일부만 보임");
  if (individualFace && individualFace.eyeOpenness < 0.18) reasons.push("눈을 감은 모습");
  if (faces.some((face) => face.x < image.naturalWidth * 0.025 || face.y < image.naturalHeight * 0.025 || face.x + face.width > image.naturalWidth * 0.975)) reasons.push("얼굴 일부가 잘림");
  if (!reasons.length) reasons.push("선명도와 구도가 양호함");
  const severe = !faces.length || sharpness < 0.065 || brightness < 0.12 || brightness > 0.95 || Boolean(individualFace && (individualFace.frontalness < 0.55 || individualFace.eyeOpenness < 0.18));
  const quality: Quality = severe || reasons.filter((reason) => reason !== "선명도와 구도가 양호함").length >= 3 ? "bad" : "good";
  const score = Math.max(20, Math.min(98, Math.round(88 - Math.max(0, 0.09 - sharpness) * 360 - Math.abs(brightness - 0.54) * 28 - Math.max(0, edgeDensity - 0.3) * 55)));
  return {
    quality,
    reasons,
    shotType: faces.length > 1 ? "group" : "individual",
    descriptors: faceResults.map((result) => result.descriptor),
    score,
  };
}

type FaceBox = { x: number; y: number; width: number; height: number };
type FaceDescription = { box: FaceBox; descriptor: number[]; score: number; eyeOpenness: number; frontalness: number };
type FaceReference = { id: number; descriptor: number[] };
type FaceMatch = { id: number; distance: number; confidence: number };
type FaceApiModule = typeof import("@vladmandic/face-api");

let faceModelsPromise: Promise<FaceApiModule> | null = null;

function loadFaceModels(): Promise<FaceApiModule> {
  if (!faceModelsPromise) {
    faceModelsPromise = import("@vladmandic/face-api").then(async (faceapi) => {
      const modelPath = "/face-models";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
      ]);
      return faceapi;
    }).catch((error) => {
      faceModelsPromise = null;
      throw error;
    });
  }
  return faceModelsPromise;
}

async function describeFaces(source: string | HTMLImageElement): Promise<FaceDescription[]> {
  const faceapi = await loadFaceModels();
  const image = typeof source === "string" ? await loadImage(source) : source;
  if (!image) return [];
  const results = await faceapi
    .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.32 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  return results.map((result) => ({
    box: {
      x: result.detection.box.x,
      y: result.detection.box.y,
      width: result.detection.box.width,
      height: result.detection.box.height,
    },
    descriptor: Array.from(result.descriptor),
    score: result.detection.score,
    eyeOpenness: Math.min(eyeAspectRatio(result.landmarks.getLeftEye()), eyeAspectRatio(result.landmarks.getRightEye())),
    frontalness: faceFrontalness(result.landmarks.getLeftEye(), result.landmarks.getRightEye(), result.landmarks.getNose(), result.detection.box),
  }));
}

function closestChild(descriptor: number[], children: FaceReference[]): FaceMatch | null {
  const normalizedDescriptor = normalizeDescriptor(descriptor);
  const candidates = children
    .map((child) => ({
      id: child.id,
      distance: Math.sqrt(normalizedDescriptor.reduce((sum, value, index) => sum + (value - normalizeDescriptor(child.descriptor)[index]) ** 2, 0)),
    }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  if (!best || best.distance > 0.58) return null;
  const second = candidates[1];
  if (second && second.distance - best.distance < 0.045) return null;
  return {
    ...best,
    confidence: Math.max(1, Math.min(99, Math.round((1 - best.distance / 0.72) * 100))),
  };
}

function eyeAspectRatio(points: Array<{ x: number; y: number }>) {
  if (points.length < 6) return 1;
  const distance = (left: { x: number; y: number }, right: { x: number; y: number }) => Math.hypot(left.x - right.x, left.y - right.y);
  return (distance(points[1], points[5]) + distance(points[2], points[4])) / (2 * distance(points[0], points[3]));
}

function faceFrontalness(leftEye: Array<{ x: number; y: number }>, rightEye: Array<{ x: number; y: number }>, nose: Array<{ x: number; y: number }>, box: FaceBox) {
  const center = (points: Array<{ x: number; y: number }>) => points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const width = (points: Array<{ x: number; y: number }>) => Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const eyeBalance = Math.min(width(leftEye), width(rightEye)) / Math.max(width(leftEye), width(rightEye), 1);
  const noseOffset = Math.abs(center(nose) - (box.x + box.width / 2)) / box.width;
  return Math.max(0, Math.min(1, eyeBalance * (1 - noseOffset * 2.6)));
}

function normalizeDescriptor(descriptor: number[]) {
  const magnitude = Math.sqrt(descriptor.reduce((sum, value) => sum + value ** 2, 0));
  return magnitude ? descriptor.map((value) => value / magnitude) : descriptor;
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
