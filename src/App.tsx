import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { ProjectsTab } from './components/tabs/ProjectsTab';
import { ModelTab } from './components/tabs/ModelTab';
import { DatasetsTab } from './components/tabs/DatasetsTab';
import { PersonalityTab } from './components/tabs/PersonalityTab';
import { TeacherTab } from './components/tabs/TeacherTab';
import { TrainTab } from './components/tabs/TrainTab';
import { EvaluateTab } from './components/tabs/EvaluateTab';
import { ChatTab } from './components/tabs/ChatTab';
import { MemoryTab } from './components/tabs/MemoryTab';
import { ExportTab } from './components/tabs/ExportTab';
import { ForgeTab } from './components/tabs/ForgeTab';
import { LiveHarvesterTab } from './components/tabs/LiveHarvesterTab';
import { OneBrainCopilot } from './components/OneBrainCopilot';

import { BrainProject, DatasetItem, ExternalMemoryItem, PersonalityTraits, TrainingHyperparameters, CheckpointMetadata } from './core/types';
import { NanoGPTModel } from './core/nanogpt_engine';
import { NanoTokenizer } from './core/tokenizer';
import { STARTER_DATASETS } from './training/datasets_store';
import { STARTER_MEMORY } from './memory/memory_store';
import { loadProjectsFromStorage, saveProjectsToStorage, BrainBundleFile, loadCheckpointWeights } from './core/checkpoint_manager';
import { BrainTrainer } from './training/trainer';
import { getPretrainedSpanishWeights, getPretrainedLuaWeights } from './training/pretrained_store';
import { RegisteredModel } from './models/model_registry';

export default function App() {
  // Load Projects from Storage
  const [projects, setProjects] = useState<BrainProject[]>(() => loadProjectsFromStorage());
  const [currentProject, setCurrentProject] = useState<BrainProject>(() => projects[0] || loadProjectsFromStorage()[0]);
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem('brainlab_active_tab') || 'chat';
  });

  useEffect(() => {
    localStorage.setItem('brainlab_active_tab', activeTab);
  }, [activeTab]);

  // Datasets & Memory
  const [datasets, setDatasets] = useState<DatasetItem[]>(() => {
    try {
      const saved = localStorage.getItem('local_brain_datasets_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return STARTER_DATASETS;
  });

  const [memoryItems, setMemoryItems] = useState<ExternalMemoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('local_brain_memory_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return STARTER_MEMORY;
  });

  // Save datasets and memory to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('local_brain_datasets_v1', JSON.stringify(datasets));
    } catch {}
  }, [datasets]);

  useEffect(() => {
    try {
      localStorage.setItem('local_brain_memory_v1', JSON.stringify(memoryItems));
    } catch {}
  }, [memoryItems]);

  // Active Checkpoint
  const activeCheckpoint = useMemo(() => {
    return currentProject.checkpoints.find(c => c.id === currentProject.currentCheckpointId) || currentProject.checkpoints[0];
  }, [currentProject]);

  // Tokenizer
  const tokenizer = useMemo(() => new NanoTokenizer(), []);

  // Neural Model Instance
  const modelRef = useRef<NanoGPTModel | null>(null);
  if (!modelRef.current) {
    modelRef.current = new NanoGPTModel(activeCheckpoint.config);
    if (activeCheckpoint.weightsSerialized) {
      modelRef.current.deserialize(activeCheckpoint.weightsSerialized);
    } else {
      activeCheckpoint.weightsSerialized = modelRef.current.serialize();
    }
  }

  // Hydrate weights from IndexedDB/Cloud if activeCheckpoint doesn't have them in memory
  useEffect(() => {
    if (activeCheckpoint && !activeCheckpoint.weightsSerialized && modelRef.current) {
      loadCheckpointWeights(activeCheckpoint.id).then(weights => {
        if (weights && modelRef.current) {
          activeCheckpoint.weightsSerialized = weights;
          modelRef.current.deserialize(weights);
        }
      });
    }
  }, [activeCheckpoint?.id]);

  // Training state
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState(activeCheckpoint.step);
  const [currentLoss, setCurrentLoss] = useState(activeCheckpoint.loss);
  const [tokensProcessed, setTokensProcessed] = useState(activeCheckpoint.totalTokensTrained || 0);
  const [tokensPerSec, setTokensPerSec] = useState(0);
  const [lossHistory, setLossHistory] = useState<{ step: number; loss: number }[]>(activeCheckpoint.history || []);
  const [teacherActive, setTeacherActive] = useState(false);

  // Hyperparameters
  const [hyperparams, setHyperparams] = useState<TrainingHyperparameters>({
    learningRate: 0.0005,
    weightDecay: 0.01,
    gradClip: 1.0,
    batchSize: 1,
    maxIters: 500,
  });

  // Trainer instance
  const trainerRef = useRef<BrainTrainer | null>(null);
  useEffect(() => {
    if (modelRef.current) {
      trainerRef.current = new BrainTrainer(modelRef.current, tokenizer, datasets, hyperparams);
      trainerRef.current.setAnchorDatasets(STARTER_DATASETS, hyperparams.replayRatio ?? 0.25);
      trainerRef.current.currentStep = trainingStep;
      trainerRef.current.totalTokensTrained = tokensProcessed;
      trainerRef.current.lossHistory = lossHistory;

      trainerRef.current.onStepCallback = (ev) => {
        setTrainingStep(ev.step);
        setCurrentLoss(ev.loss);
        setTokensProcessed(ev.tokensProcessed);
        setTokensPerSec(ev.tokensPerSec);
        setLossHistory(prev => [...prev.slice(-100), { step: ev.step, loss: ev.loss }]);
      };

      trainerRef.current.onFinishedCallback = () => {
        setIsTraining(false);
      };
    }
  }, [modelRef.current, datasets]);

  // Switch Checkpoint
  const handleSwitchCheckpoint = async (cpId: string) => {
    const cp = currentProject.checkpoints.find(c => c.id === cpId);
    if (!cp) return;

    if (trainerRef.current && isTraining) {
      trainerRef.current.pauseTraining();
      setIsTraining(false);
    }

    let weights = cp.weightsSerialized;
    if (!weights) {
      weights = (await loadCheckpointWeights(cpId)) || undefined;
      if (weights) {
        cp.weightsSerialized = weights;
      }
    }

    const updatedProject = { ...currentProject, currentCheckpointId: cpId };
    setCurrentProject(updatedProject);
    const updatedAll = projects.map(p => p.id === updatedProject.id ? updatedProject : p);
    setProjects(updatedAll);
    saveProjectsToStorage(updatedAll);

    // Reinitialize model
    modelRef.current = new NanoGPTModel(cp.config);
    if (weights) {
      modelRef.current.deserialize(weights);
    }

    setTrainingStep(cp.step);
    setCurrentLoss(cp.loss);
    setTokensProcessed(cp.totalTokensTrained || 0);
    setLossHistory(cp.history || []);
  };

  // Switch Active Student Architecture
  const handleSwitchStudentArchitecture = (model: RegisteredModel) => {
    if (!model.gptConfig) return;
    if (trainerRef.current && isTraining) {
      trainerRef.current.pauseTraining();
      setIsTraining(false);
    }

    const newCpId = `brain_arch_${Date.now().toString().slice(-4)}`;
    const newModel = new NanoGPTModel(model.gptConfig);
    const serialized = newModel.serialize();

    const newCheckpoint: CheckpointMetadata = {
      id: newCpId,
      name: `${model.name} (Inicial)`,
      version: 1,
      createdAt: new Date().toISOString(),
      branch: currentProject.activeBranch || 'main',
      step: 0,
      loss: 4.85,
      totalTokensTrained: 0,
      config: model.gptConfig,
      paramCount: model.parameterCount,
      weightsSerialized: serialized,
      history: [],
      traits: { ...currentProject.traits },
      notes: `Instanciado desde catálogo: ${model.name} (${model.parameterCountFormatted} parámetros).`,
    };

    const updatedProject = {
      ...currentProject,
      currentCheckpointId: newCpId,
      checkpoints: [newCheckpoint, ...currentProject.checkpoints],
    };

    setCurrentProject(updatedProject);
    const updatedAll = projects.map(p => p.id === updatedProject.id ? updatedProject : p);
    setProjects(updatedAll);
    saveProjectsToStorage(updatedAll);

    modelRef.current = newModel;
    setTrainingStep(0);
    setCurrentLoss(4.85);
    setTokensProcessed(0);
    setLossHistory([]);
  };

  // Start Training
  const handleStartTraining = async (steps: number) => {
    if (!trainerRef.current || isTraining) return;
    setIsTraining(true);
    trainerRef.current.setHyperparameters(hyperparams);
    trainerRef.current.setDatasets(datasets);
    await trainerRef.current.startTraining(steps);
    setIsTraining(false);
  };

  // Pause Training
  const handlePauseTraining = () => {
    if (trainerRef.current) {
      trainerRef.current.pauseTraining();
    }
    setIsTraining(false);
  };

  // Single step
  const handleStepOnce = () => {
    if (!trainerRef.current || isTraining) return;
    const res = trainerRef.current.stepIteration();
    setTrainingStep(res.step);
    setCurrentLoss(res.loss);
    setTokensProcessed(prev => prev + (modelRef.current?.config.block_size || 64));
    setLossHistory(prev => [...prev, { step: res.step, loss: res.loss }]);
  };

  // Save Checkpoint
  const handleSaveCheckpoint = (notes: string) => {
    if (!modelRef.current) return;
    const newVersion = (activeCheckpoint.version || 1) + 1;
    const newCpId = `brain_${Date.now().toString().slice(-4)}_v${newVersion}`;

    const newCp = {
      id: newCpId,
      name: `Checkpoint ${newVersion} - Paso ${trainingStep}`,
      version: newVersion,
      createdAt: new Date().toISOString(),
      branch: currentProject.activeBranch,
      step: trainingStep,
      loss: currentLoss,
      totalTokensTrained: tokensProcessed,
      config: modelRef.current.config,
      paramCount: activeCheckpoint.paramCount,
      weightsSerialized: modelRef.current.serialize(),
      history: [...lossHistory],
      traits: { ...currentProject.traits },
      notes: notes.trim() || `Guardado manual en el paso ${trainingStep}. Loss: ${currentLoss.toFixed(3)}.`,
    };

    const updatedProject = {
      ...currentProject,
      currentCheckpointId: newCp.id,
      checkpoints: [newCp, ...currentProject.checkpoints],
      updatedAt: new Date().toISOString(),
    };

    setCurrentProject(updatedProject);
    const updatedAll = projects.map(p => p.id === updatedProject.id ? updatedProject : p);
    setProjects(updatedAll);
    saveProjectsToStorage(updatedAll);
  };

  // Inyectar muestras destiladas y entrenar inmediatamente
  const handleInjectSamplesAndTrain = (samples: DatasetItem[]) => {
    setDatasets(prev => [...samples, ...prev]);
    if (trainerRef.current) {
      trainerRef.current.setDatasets([...samples, ...datasets]);
    }
  };

  // Cargar pesos pre-entrenados base
  const handleLoadPretrainedWeights = (type: 'spanish' | 'lua') => {
    if (!modelRef.current) return;
    const serialized = type === 'spanish' ? getPretrainedSpanishWeights() : getPretrainedLuaWeights();
    modelRef.current.deserialize(serialized);

    const newStep = type === 'spanish' ? 250 : 200;
    const newLoss = type === 'spanish' ? 1.78 : 1.92;
    setTrainingStep(newStep);
    setCurrentLoss(newLoss);
    setLossHistory(prev => [...prev, { step: newStep, loss: newLoss }]);

    // Crear un checkpoint conmemorativo
    const newCpId = `cp_prebaked_${type}_${Date.now()}`;
    const newCp = {
      id: newCpId,
      name: type === 'spanish' ? 'Pesos Base Español (Pre-baked)' : 'Pesos Base Lua (Pre-baked)',
      version: (activeCheckpoint.version || 1) + 1,
      createdAt: new Date().toISOString(),
      branch: currentProject.activeBranch,
      step: newStep,
      loss: newLoss,
      totalTokensTrained: 25000,
      config: modelRef.current.config,
      paramCount: activeCheckpoint.paramCount,
      weightsSerialized: serialized,
      history: [{ step: 0, loss: 4.8 }, { step: newStep, loss: newLoss }],
      traits: { ...currentProject.traits },
      notes: `Pesos pre-entrenados cargados internamente (${type === 'spanish' ? 'Español Conversacional' : 'Sintaxis Lua'}).`,
    };

    const updatedProject = {
      ...currentProject,
      currentCheckpointId: newCp.id,
      checkpoints: [newCp, ...currentProject.checkpoints],
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(updatedProject);
    const updatedAll = projects.map(p => p.id === updatedProject.id ? updatedProject : p);
    setProjects(updatedAll);
    saveProjectsToStorage(updatedAll);
  };

  // Import .brain Bundle
  const handleImportBrainBundle = (bundle: BrainBundleFile) => {
    const newProj: BrainProject = {
      id: `proj_imported_${Date.now()}`,
      name: bundle.name,
      description: `Cerebro importado (${bundle.metadata.notes || 'sin descripción'}).`,
      createdAt: bundle.exportedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentCheckpointId: 'imported_cp_01',
      activeBranch: bundle.metadata.branch || 'main',
      branches: [bundle.metadata.branch || 'main'],
      traits: bundle.traits || currentProject.traits,
      multilingualRatio: { spanish: 60, english: 30, portuguese: 10 },
      checkpoints: [
        {
          id: 'imported_cp_01',
          name: `Checkpoint v${bundle.version} (Importado)`,
          version: bundle.version,
          createdAt: bundle.exportedAt || new Date().toISOString(),
          branch: bundle.metadata.branch || 'main',
          step: bundle.metadata.step || 0,
          loss: bundle.metadata.loss || 2.0,
          totalTokensTrained: 10000,
          config: bundle.config,
          paramCount: bundle.paramCount,
          weightsSerialized: bundle.weightsSerialized,
          history: [{ step: bundle.metadata.step || 0, loss: bundle.metadata.loss || 2.0 }],
          traits: bundle.traits,
          notes: bundle.metadata.notes || 'Importado desde bundle .brain',
        },
      ],
    };

    const updatedProjects = [newProj, ...projects];
    setProjects(updatedProjects);
    saveProjectsToStorage(updatedProjects);
    setCurrentProject(newProj);

    // Rebuild model with imported weights
    modelRef.current = new NanoGPTModel(bundle.config);
    modelRef.current.deserialize(bundle.weightsSerialized);

    setTrainingStep(bundle.metadata.step || 0);
    setCurrentLoss(bundle.metadata.loss || 2.0);
    setLossHistory([{ step: bundle.metadata.step || 0, loss: bundle.metadata.loss || 2.0 }]);

    if (bundle.optionalMemory && bundle.optionalMemory.length > 0) {
      setMemoryItems(prev => [...bundle.optionalMemory!, ...prev]);
    }

    setActiveTab('chat');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header & Tab Navigation */}
      <Header
        currentProject={currentProject}
        projects={projects}
        onSelectProject={(p) => {
          setCurrentProject(p);
          const cp = p.checkpoints.find(c => c.id === p.currentCheckpointId) || p.checkpoints[0];
          if (cp) {
            modelRef.current = new NanoGPTModel(cp.config);
            if (cp.weightsSerialized) {
              modelRef.current.deserialize(cp.weightsSerialized);
            }
            setTrainingStep(cp.step);
            setCurrentLoss(cp.loss);
            setLossHistory(cp.history || []);
          }
        }}
        isTraining={isTraining}
        trainingStep={trainingStep}
        currentLoss={currentLoss}
        teacherActive={teacherActive}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'projects' && (
          <ProjectsTab
            projects={projects}
            currentProject={currentProject}
            onSelectProject={setCurrentProject}
            onSaveProjects={(projs) => {
              setProjects(projs);
              saveProjectsToStorage(projs);
            }}
            onSwitchCheckpoint={handleSwitchCheckpoint}
          />
        )}

        {activeTab === 'model' && (
          <ModelTab
            currentProject={currentProject}
            onSwitchStudentArchitecture={handleSwitchStudentArchitecture}
          />
        )}

        {activeTab === 'data' && (
          <DatasetsTab
            datasets={datasets}
            currentProject={currentProject}
            onUpdateDatasets={setDatasets}
            onUpdateProjectRatios={(ratios) => {
              const updated = { ...currentProject, multilingualRatio: ratios };
              setCurrentProject(updated);
              const updatedAll = projects.map(p => p.id === updated.id ? updated : p);
              setProjects(updatedAll);
              saveProjectsToStorage(updatedAll);
            }}
          />
        )}

        {activeTab === 'personality' && (
          <PersonalityTab
            currentProject={currentProject}
            traits={currentProject.traits}
            onUpdateTraits={(t) => {
              const updated = { ...currentProject, traits: t };
              setCurrentProject(updated);
              const updatedAll = projects.map(p => p.id === updated.id ? updated : p);
              setProjects(updatedAll);
              saveProjectsToStorage(updatedAll);
            }}
            onAddDatasetItems={(items) => setDatasets(prev => [...items, ...prev])}
          />
        )}

        {activeTab === 'teacher' && (
          <TeacherTab
            traits={currentProject.traits}
            onAddDatasetItems={(items) => setDatasets(prev => [...items, ...prev])}
            onSetTeacherActive={setTeacherActive}
          />
        )}

        <div className={activeTab === 'train' ? 'block' : 'hidden'}>
          <TrainTab
            currentProject={currentProject}
            traits={currentProject.traits}
            isTraining={isTraining}
            currentStep={trainingStep}
            currentLoss={currentLoss}
            tokensProcessed={tokensProcessed}
            tokensPerSec={tokensPerSec}
            lossHistory={lossHistory}
            hyperparams={hyperparams}
            onUpdateHyperparams={setHyperparams}
            onStartTraining={handleStartTraining}
            onPauseTraining={handlePauseTraining}
            onStepOnce={handleStepOnce}
            onSaveCheckpoint={handleSaveCheckpoint}
            onInjectSamplesAndTrain={handleInjectSamplesAndTrain}
            onLoadPretrainedWeights={handleLoadPretrainedWeights}
          />
        </div>

        {activeTab === 'harvester' && (
          <LiveHarvesterTab
            onInjectSamples={(samples) => setDatasets(prev => [...samples, ...prev])}
          />
        )}

        {activeTab === 'evaluate' && modelRef.current && (
          <EvaluateTab
            currentProject={currentProject}
            model={modelRef.current}
            tokenizer={tokenizer}
          />
        )}

        {activeTab === 'chat' && modelRef.current && (
          <ChatTab
            currentProject={currentProject}
            model={modelRef.current}
            tokenizer={tokenizer}
            memoryItems={memoryItems}
            onAddDatasetItem={(item) => setDatasets(prev => [item, ...prev])}
            onInjectSamplesAndTrain={handleInjectSamplesAndTrain}
            onStartTraining={handleStartTraining}
            onStepOnce={handleStepOnce}
            isTraining={isTraining}
            trainingStep={trainingStep}
            currentLoss={currentLoss}
            traits={currentProject.traits}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryTab
            memoryItems={memoryItems}
            onUpdateMemory={setMemoryItems}
          />
        )}

        {activeTab === 'export' && (
          <ExportTab
            currentProject={currentProject}
            memoryItems={memoryItems}
            onImportBrainBundle={handleImportBrainBundle}
          />
        )}

        {activeTab === 'forge' && (
          <ForgeTab
            currentProject={currentProject}
          />
        )}
      </main>

      {/* Floating Real-time Copilot & Navigator */}
      <OneBrainCopilot activeTab={activeTab} onNavigate={setActiveTab} />
    </div>
  );
}
