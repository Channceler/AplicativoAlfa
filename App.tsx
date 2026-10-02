import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

type TabId = 'todo' | 'security' | 'map' | 'camera' | 'storage';
type OrganizerSection = 'today' | 'tasks' | 'habits' | 'notes';
type TaskPriority = 'Baixa' | 'Média' | 'Alta';
type AuthScreen = 'login' | 'signup' | 'app';
type TodoItem = {
  id: string;
  title: string;
  done: boolean;
  createdAt?: string;
  category?: string;
  priority?: TaskPriority;
  dueDate?: string;
  reminderTime?: string;
  notificationId?: string;
};
type HabitItem = { id: string; title: string; createdAt: string; completedDates: string[] };
type NoteItem = { id: string; title: string; body: string; updatedAt: string };
type StoredItem = { key: string; value: string };
type SavedPhoto = { id: string; uri: string; savedAt: string; taskId?: string };
type SavedPosition = { id: string; latitude: number; longitude: number; accuracy: number | null; savedAt: string };

const TASKS_KEY = '@aplicativo-alfa/tasks/v1';
const PHOTOS_KEY = '@aplicativo-alfa/photos/v1';
const BIOMETRICS_KEY = '@aplicativo-alfa/biometrics/v1';
const POSITIONS_KEY = '@aplicativo-alfa/positions/v1';
const HABITS_KEY = '@aplicativo-alfa/habits/v1';
const NOTES_KEY = '@aplicativo-alfa/notes/v1';
const APP_STORAGE_PREFIX = '@aplicativo-alfa/';
const MAX_SAVED_POSITIONS = 50;
const TASK_CATEGORIES = ['Pessoal', 'Trabalho', 'Casa', 'Saúde'];
const TASK_PRIORITIES: TaskPriority[] = ['Baixa', 'Média', 'Alta'];
const ORGANIZER_SECTIONS: { id: OrganizerSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'today', label: 'Meu dia', icon: 'sunny-outline' },
  { id: 'tasks', label: 'Tarefas', icon: 'checkbox-outline' },
  { id: 'habits', label: 'Hábitos', icon: 'repeat-outline' },
  { id: 'notes', label: 'Notas', icon: 'document-text-outline' },
];

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function parseSavedPhotos(value: string | null): SavedPhoto[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some((photo) =>
      typeof photo !== 'object' ||
      photo === null ||
      !('id' in photo) ||
      typeof photo.id !== 'string' ||
      !('uri' in photo) ||
      typeof photo.uri !== 'string' ||
      !('savedAt' in photo) ||
      typeof photo.savedAt !== 'string',
    )
  ) {
    throw new Error('Formato inválido na lista de fotos salvas.');
  }
  return parsed;
}

function parseBiometricDate(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && 'registeredAt' in parsed && typeof parsed.registeredAt === 'string') {
      return parsed.registeredAt;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function formatDateTime(value: string | undefined, mode: 'date' | 'time' | 'dateTime' = 'dateTime') {
  if (!value) return 'Não disponível';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não disponível';
  const options: Intl.DateTimeFormatOptions = mode === 'date'
    ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : mode === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function formatCoordinates(value: number) {
  return value.toFixed(6);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date;
}

function formatLocalDate(value: string | undefined) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function parseHabitItems(value: string | null): HabitItem[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some((habit) =>
      typeof habit !== 'object' ||
      habit === null ||
      !('id' in habit) ||
      typeof habit.id !== 'string' ||
      !('title' in habit) ||
      typeof habit.title !== 'string' ||
      !('createdAt' in habit) ||
      typeof habit.createdAt !== 'string' ||
      !('completedDates' in habit) ||
      !Array.isArray(habit.completedDates) ||
      habit.completedDates.some((date: unknown) => typeof date !== 'string'),
    )
  ) {
    throw new Error('Formato inválido na lista de hábitos.');
  }
  return parsed;
}

function parseNoteItems(value: string | null): NoteItem[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some((note) =>
      typeof note !== 'object' ||
      note === null ||
      !('id' in note) ||
      typeof note.id !== 'string' ||
      !('title' in note) ||
      typeof note.title !== 'string' ||
      !('body' in note) ||
      typeof note.body !== 'string' ||
      !('updatedAt' in note) ||
      typeof note.updatedAt !== 'string',
    )
  ) {
    throw new Error('Formato inválido na lista de notas.');
  }
  return parsed;
}

function habitStreak(completedDates: string[], today: string) {
  const completed = new Set(completedDates);
  const cursor = new Date(`${today}T12:00:00`);
  if (!completed.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (completed.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function parseSavedPositions(value: string | null): SavedPosition[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some((position) =>
      typeof position !== 'object' ||
      position === null ||
      !('id' in position) ||
      typeof position.id !== 'string' ||
      !('latitude' in position) ||
      typeof position.latitude !== 'number' ||
      !('longitude' in position) ||
      typeof position.longitude !== 'number' ||
      !('accuracy' in position) ||
      (typeof position.accuracy !== 'number' && position.accuracy !== null) ||
      !('savedAt' in position) ||
      typeof position.savedAt !== 'string',
    )
  ) {
    throw new Error('Formato inválido no histórico de posições.');
  }
  return parsed;
}

const tabs: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'todo', label: 'Organizar', icon: 'calendar-outline' },
  { id: 'security', label: 'Segurança', icon: 'shield-checkmark-outline' },
  { id: 'map', label: 'Mapa', icon: 'map-outline' },
  { id: 'camera', label: 'Câmera', icon: 'camera-outline' },
  { id: 'storage', label: 'Dados', icon: 'server-outline' },
];

const screenCopy: Record<TabId, { eyebrow: string; title: string; subtitle: string }> = {
  todo: { eyebrow: 'ESPAÇO PESSOAL', title: 'Organize seu dia.', subtitle: 'Tarefas, hábitos e ideias em um só lugar.' },
  security: { eyebrow: 'CONFIGURAÇÕES', title: 'Sua segurança.', subtitle: 'Gerencie o cadastro biométrico do aparelho.' },
  map: { eyebrow: 'AO SEU REDOR', title: 'Você está aqui.', subtitle: 'Veja sua posição atual no mapa.' },
  camera: { eyebrow: 'CAPTURA RÁPIDA', title: 'Guarde o momento.', subtitle: 'Use a câmera do aparelho para tirar uma foto.' },
  storage: { eyebrow: 'ARMAZENAMENTO LOCAL', title: 'Seus dados, à vista.', subtitle: 'Consulte os dados salvos por este app no aparelho.' },
};

export default function App() {
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupLogin, setSignupLogin] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('todo');
  const [organizerSection, setOrganizerSection] = useState<OrganizerSection>('today');
  const [tasks, setTasks] = useState<TodoItem[]>([]);
  const [tasksReady, setTasksReady] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [taskCategory, setTaskCategory] = useState(TASK_CATEGORIES[0]);
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('Média');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskReminderTime, setTaskReminderTime] = useState('09:00');
  const [taskReminderEnabled, setTaskReminderEnabled] = useState(false);
  const [taskMessage, setTaskMessage] = useState('');
  const [habits, setHabits] = useState<HabitItem[]>([]);
  const [newHabit, setNewHabit] = useState('');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [bioState, setBioState] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioMessage, setBioMessage] = useState('');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationNeedsSettings, setLocationNeedsSettings] = useState(false);
  const [mapLoadMessage, setMapLoadMessage] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTaskId, setPhotoTaskId] = useState('');
  const [selectedPhotoTaskId, setSelectedPhotoTaskId] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [savedPositions, setSavedPositions] = useState<SavedPosition[]>([]);
  const [storedItems, setStoredItems] = useState<StoredItem[]>([]);
  const [storageBusy, setStorageBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const skipNextTaskSave = useRef(false);
  const skipNextHabitsSave = useRef(false);
  const skipNextNotesSave = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const isCompactScreen = screenWidth < 360;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.multiGet([TASKS_KEY, HABITS_KEY, NOTES_KEY, PHOTOS_KEY])
      .then((pairs) => {
        if (!mounted) return;
        const valueFor = (key: string) => pairs.find(([storedKey]) => storedKey === key)?.[1] ?? null;
        const taskValue = valueFor(TASKS_KEY);
        if (taskValue) setTasks(JSON.parse(taskValue) as TodoItem[]);
        setHabits(parseHabitItems(valueFor(HABITS_KEY)));
        setNotes(parseNoteItems(valueFor(NOTES_KEY)));
        setSavedPhotos(parseSavedPhotos(valueFor(PHOTOS_KEY)));
      })
      .catch(() => Alert.alert('Não foi possível carregar os dados locais', 'Tente abrir novamente o organizador do app.'))
      .finally(() => { if (mounted) setTasksReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (tasksReady) {
      if (skipNextTaskSave.current) {
        skipNextTaskSave.current = false;
        return;
      }
      AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks)).catch(() =>
        Alert.alert('Não foi possível salvar', 'Confira o armazenamento do aparelho e tente novamente.'),
      );
    }
  }, [tasks, tasksReady]);

  useEffect(() => {
    if (tasksReady) {
      if (skipNextHabitsSave.current) {
        skipNextHabitsSave.current = false;
        return;
      }
      AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits)).catch(() =>
        Alert.alert('Não foi possível salvar os hábitos', 'Confira o armazenamento do aparelho e tente novamente.'),
      );
    }
  }, [habits, tasksReady]);

  useEffect(() => {
    if (tasksReady) {
      if (skipNextNotesSave.current) {
        skipNextNotesSave.current = false;
        return;
      }
      AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes)).catch(() =>
        Alert.alert('Não foi possível salvar as notas', 'Confira o armazenamento do aparelho e tente novamente.'),
      );
    }
  }, [notes, tasksReady]);

  useEffect(() => {
    if (activeTab !== 'security') return;
    let mounted = true;
    Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      AsyncStorage.getItem(BIOMETRICS_KEY),
    ])
      .then(([hasHardware, isEnrolled, registration]) => {
        if (!mounted) return;
        setBioState(hasHardware && isEnrolled ? 'ready' : 'missing');
        setBioEnabled(Boolean(registration && parseBiometricDate(registration)));
      })
      .catch(() => {
        if (!mounted) return;
        setBioState('missing');
        Alert.alert('Falha ao consultar biometria', 'Não foi possível verificar a biometria ou ler seu cadastro local.');
      });
    return () => { mounted = false; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'storage') void refreshStorage();
  }, [activeTab]);

  async function addTask() {
    const title = newTask.trim();
    if (!title) {
      setTaskMessage('Digite um título para a tarefa.');
      return;
    }

    const dueDate = taskDueDate.trim() ? parseLocalDate(taskDueDate) : null;
    if (taskDueDate.trim() && !dueDate) {
      setTaskMessage('Informe um prazo válido no formato DD/MM/AAAA.');
      return;
    }

    const id = `${Date.now()}`;
    let notificationId: string | undefined;
    if (taskReminderEnabled) {
      if (!dueDate) {
        setTaskMessage('Informe o prazo da tarefa para programar um lembrete.');
        return;
      }
      const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(taskReminderTime.trim());
      if (!timeMatch) {
        setTaskMessage('Informe um horário válido no formato HH:MM.');
        return;
      }
      dueDate.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
      if (dueDate.getTime() <= Date.now()) {
        setTaskMessage('O horário do lembrete precisa estar no futuro.');
        return;
      }
      try {
        if (Platform.OS === 'android') {
          await setNotificationChannelAsync('task-reminders', {
            name: 'Lembretes de tarefas',
            importance: AndroidImportance.DEFAULT,
          });
        }
        const { status } = await requestPermissionsAsync();
        if (status !== 'granted') {
          setTaskMessage('Permita notificações nas configurações do aparelho para criar este lembrete.');
          return;
        }
        notificationId = await scheduleNotificationAsync({
          content: { title: 'Lembrete de tarefa', body: title, data: { taskId: id } },
          trigger: { type: SchedulableTriggerInputTypes.DATE, date: dueDate },
        });
      } catch {
        setTaskMessage('Não foi possível programar o lembrete. Verifique as permissões e tente novamente.');
        return;
      }
    }

    const task: TodoItem = {
      id,
      title,
      done: false,
      createdAt: new Date().toISOString(),
      category: taskCategory,
      priority: taskPriority,
      dueDate: dueDate ? localDateKey(dueDate) : undefined,
      reminderTime: taskReminderEnabled ? taskReminderTime.trim() : undefined,
      notificationId,
    };
    setTasks((current) => [task, ...current]);
    setNewTask('');
    setTaskDueDate('');
    setTaskReminderEnabled(false);
    setTaskMessage('');
  }

  async function toggleTask(task: TodoItem) {
    const done = !task.done;
    try {
      let notificationId = task.notificationId;
      if (done && notificationId) {
        await cancelScheduledNotificationAsync(notificationId);
        notificationId = undefined;
      } else if (!done && task.reminderTime && task.dueDate) {
        const dueDate = new Date(`${task.dueDate}T${task.reminderTime}:00`);
        if (dueDate.getTime() > Date.now()) {
          notificationId = await scheduleNotificationAsync({
            content: { title: 'Lembrete de tarefa', body: task.title, data: { taskId: task.id } },
            trigger: { type: SchedulableTriggerInputTypes.DATE, date: dueDate },
          });
        }
      }
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done, notificationId } : item));
    } catch {
      Alert.alert('Não foi possível atualizar a tarefa', 'A tarefa não foi alterada porque o lembrete não pôde ser atualizado.');
    }
  }

  async function deleteTask(task: TodoItem) {
    try {
      if (task.notificationId) await cancelScheduledNotificationAsync(task.notificationId);
      const updatedPhotos = savedPhotos.map((photo) => photo.taskId === task.id ? { ...photo, taskId: undefined } : photo);
      if (updatedPhotos.some((photo, index) => photo.taskId !== savedPhotos[index]?.taskId)) {
        await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(updatedPhotos));
        setSavedPhotos(updatedPhotos);
      }
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch {
      Alert.alert('Não foi possível excluir a tarefa', 'O lembrete ainda está ativo. Tente novamente.');
    }
  }

  function addHabit() {
    const title = newHabit.trim();
    if (!title) return;
    setHabits((current) => [...current, { id: `${Date.now()}`, title, createdAt: new Date().toISOString(), completedDates: [] }]);
    setNewHabit('');
  }

  function toggleHabitToday(habit: HabitItem) {
    const today = localDateKey();
    setHabits((current) => current.map((item) => item.id !== habit.id ? item : {
      ...item,
      completedDates: item.completedDates.includes(today)
        ? item.completedDates.filter((date) => date !== today)
        : [...item.completedDates, today],
    }));
  }

  function addNote() {
    const title = newNoteTitle.trim();
    const body = newNoteBody.trim();
    if (!title && !body) return;
    if (editingNoteId) {
      setNotes((current) => current.map((note) => note.id === editingNoteId
        ? { ...note, title: title || 'Nota rápida', body, updatedAt: new Date().toISOString() }
        : note));
      setEditingNoteId(null);
    } else {
      setNotes((current) => [{ id: `${Date.now()}`, title: title || 'Nota rápida', body, updatedAt: new Date().toISOString() }, ...current]);
    }
    setNewNoteTitle('');
    setNewNoteBody('');
  }

  function editNote(note: NoteItem) {
    setEditingNoteId(note.id);
    setNewNoteTitle(note.title);
    setNewNoteBody(note.body);
  }

  function cancelNoteEdit() {
    setEditingNoteId(null);
    setNewNoteTitle('');
    setNewNoteBody('');
  }

  async function refreshStorage() {
    setStorageBusy(true);
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(APP_STORAGE_PREFIX));
      const pairs = await AsyncStorage.multiGet(keys);
      setStoredItems(pairs.map(([key, value]) => ({ key, value: value ?? '' })));
      setSavedPhotos(parseSavedPhotos(pairs.find(([key]) => key === PHOTOS_KEY)?.[1] ?? null));
      setSavedPositions(parseSavedPositions(pairs.find(([key]) => key === POSITIONS_KEY)?.[1] ?? null));
    } catch {
      Alert.alert('Falha ao consultar dados', 'Não foi possível ler o armazenamento local.');
    } finally {
      setStorageBusy(false);
    }
  }

  async function clearStorage() {
    const keys = storedItems.map(({ key }) => key);
    if (!keys.length && !tasks.length) return;
    try {
      const reminderIds = tasks.flatMap((task) => task.notificationId ? [task.notificationId] : []);
      const cancelledReminders = await Promise.allSettled(
        reminderIds.map((notificationId) => cancelScheduledNotificationAsync(notificationId)),
      );
      const documentDirectory = FileSystem.documentDirectory;
      if (!documentDirectory) throw new Error('O armazenamento permanente não está disponível.');
      const photosDirectory = `${documentDirectory}aplicativo-alfa/photos/`;
      const directoryInfo = await FileSystem.getInfoAsync(photosDirectory);
      if (directoryInfo.exists) await FileSystem.deleteAsync(photosDirectory, { idempotent: true });
      await AsyncStorage.multiRemove(keys);
      skipNextTaskSave.current = true;
      skipNextHabitsSave.current = true;
      skipNextNotesSave.current = true;
      setTasks([]);
      setHabits([]);
      setNotes([]);
      setSavedPhotos([]);
      setSavedPositions([]);
      setPhotoUri(null);
      setPhotoTaskId('');
      setBioEnabled(false);
      setBioMessage('');
      await refreshStorage();
      if (cancelledReminders.some((result) => result.status === 'rejected')) {
        Alert.alert('Dados limpos', 'Os dados foram removidos, mas um ou mais lembretes não puderam ser cancelados.');
      }
    } catch {
      Alert.alert('Falha ao limpar dados', 'Tente novamente.');
    }
  }

  async function setBiometricsEnabled(enabled: boolean) {
    setBioBusy(true);
    setBioMessage('');
    try {
      if (enabled) {
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirmar cadastro biométrico' });
        if (!result.success) {
          setBioMessage('A confirmação foi cancelada. A biometria continua desativada.');
          return;
        }
        await saveBiometricRegistration();
      } else {
        await AsyncStorage.removeItem(BIOMETRICS_KEY);
      }
      setBioEnabled(enabled);
    } catch {
      Alert.alert(
        enabled ? 'Biometria não ativada' : 'Biometria não removida',
        'Não foi possível atualizar o cadastro biométrico. Tente novamente.',
      );
    } finally {
      setBioBusy(false);
    }
  }

  async function saveBiometricRegistration() {
    await AsyncStorage.setItem(BIOMETRICS_KEY, JSON.stringify({
      status: 'cadastrada',
      tipo: 'Biometria do aparelho',
      registeredAt: new Date().toISOString(),
    }));
  }

  async function locateMe() {
    setLocationBusy(true);
    setLocationMessage('');
    setLocationNeedsSettings(false);
    let hasKnownPosition = Boolean(location);
    let hasCurrentPosition = false;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationMessage('A permissão de localização foi negada. Você pode ativá-la nas configurações do aparelho.');
        setLocationNeedsSettings(!permission.canAskAgain);
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationMessage('Ative a localização (GPS) do aparelho e tente novamente.');
        return;
      }
      const lastKnownPosition = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 1_000,
      });
      if (lastKnownPosition) {
        hasKnownPosition = true;
        setLocation(lastKnownPosition);
      }
      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      hasCurrentPosition = true;
      hasKnownPosition = true;
      setLocation(currentPosition);
      const savedAt = new Date().toISOString();
      const position: SavedPosition = {
        id: `${Date.now()}`,
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
        accuracy: currentPosition.coords.accuracy,
        savedAt,
      };
      const existingPositions = parseSavedPositions(await AsyncStorage.getItem(POSITIONS_KEY));
      const updatedPositions = [position, ...existingPositions].slice(0, MAX_SAVED_POSITIONS);
      await AsyncStorage.setItem(POSITIONS_KEY, JSON.stringify(updatedPositions));
      setSavedPositions(updatedPositions);
      setLocationMessage('');
    } catch {
      setLocationMessage(
        hasCurrentPosition
          ? 'Sua posição foi obtida, mas não foi possível salvá-la em Dados. Tente novamente.'
          : hasKnownPosition
          ? 'Não foi possível obter e salvar uma nova posição. A última posição conhecida continua no mapa.'
          : 'Não foi possível obter e salvar sua posição. Verifique o GPS e tente novamente.',
      );
    } finally {
      setLocationBusy(false);
    }
  }

  async function openLocationSettings() {
    try {
      await Linking.openSettings();
    } catch {
      setLocationMessage('Não foi possível abrir as configurações. Ative a localização nas definições do aparelho.');
    }
  }

  async function openMapCredits() {
    try {
      await Linking.openURL('https://www.openstreetmap.org/copyright');
    } catch {
      setLocationMessage('Não foi possível abrir os créditos do mapa.');
    }
  }

  async function takePhoto() {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return;
    }
    setCameraBusy(true);
    let destinationUri: string | null = null;
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.82 });
      if (!photo?.uri) throw new Error('A câmera não retornou uma imagem.');
      const documentDirectory = FileSystem.documentDirectory;
      if (!documentDirectory) throw new Error('O armazenamento permanente não está disponível.');
      const photosDirectory = `${documentDirectory}aplicativo-alfa/photos/`;
      await FileSystem.makeDirectoryAsync(photosDirectory, { intermediates: true });
      const id = `${Date.now()}`;
      destinationUri = `${photosDirectory}${id}.jpg`;
      await FileSystem.copyAsync({ from: photo.uri, to: destinationUri });
      const existingPhotos = parseSavedPhotos(await AsyncStorage.getItem(PHOTOS_KEY));
      const savedPhoto: SavedPhoto = {
        id,
        uri: destinationUri,
        savedAt: new Date().toISOString(),
        taskId: selectedPhotoTaskId || undefined,
      };
      await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify([savedPhoto, ...existingPhotos]));
      setPhotoUri(destinationUri);
      setPhotoTaskId(selectedPhotoTaskId);
      setSavedPhotos((current) => [savedPhoto, ...current]);
    } catch {
      let cleanupFailed = false;
      if (destinationUri) {
        try {
          await FileSystem.deleteAsync(destinationUri, { idempotent: true });
        } catch {
          cleanupFailed = true;
        }
      }
      Alert.alert(
        'Não foi possível salvar a foto',
        cleanupFailed
          ? 'O arquivo temporário não pôde ser removido. Libere espaço no aparelho e tente novamente.'
          : 'Verifique as permissões e o espaço disponível no aparelho e tente novamente.',
      );
    } finally {
      setCameraBusy(false);
    }
  }

  function submitLogin() {
    if (!login.trim() || !password) {
      setAuthMessage('Preencha o login e a senha para continuar.');
      return;
    }
    setAuthMessage('');
    setAuthScreen('app');
  }

  function submitSignup() {
    if (!fullName.trim() || !signupLogin.trim() || !signupPassword || !confirmPassword) {
      setAuthMessage('Preencha todos os campos para criar sua conta.');
      return;
    }
    if (signupPassword.length < 8) {
      setAuthMessage('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (signupPassword !== confirmPassword) {
      setAuthMessage('As senhas não conferem.');
      return;
    }
    setAuthMessage('');
    setAuthScreen('app');
  }

  if (authScreen !== 'app') {
    const isSignup = authScreen === 'signup';

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView style={styles.authShell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.authScroll, isCompactScreen && styles.authScrollCompact]} keyboardShouldPersistTaps="handled">
            <View style={styles.authBrand}>
              <View style={styles.authBrandMark}><Text style={styles.brandMarkText}>A</Text></View>
              <Text style={styles.authBrandName}>ALFA</Text>
            </View>

            <View style={[styles.authCard, isCompactScreen && styles.authCardCompact]}>
              <Text style={styles.authEyebrow}>{isSignup ? 'NOVA CONTA' : 'SEJA BEM-VINDO'}</Text>
              <Text style={styles.authTitle}>{isSignup ? 'Cadastre-se' : 'Login'}</Text>
              <Text style={styles.authSubtitle}>
                {isSignup
                  ? 'Crie sua conta para começar a usar o Aplicativo Alfa.'
                  : 'Entre com seus dados para acessar o Aplicativo Alfa.'}
              </Text>

              <View style={styles.authForm}>
                  {isSignup && (
                    <View style={styles.authField}>
                      <Text style={styles.authLabel}>Nome completo</Text>
                      <View style={styles.authInputWrap}>
                        <Ionicons name="person-outline" size={19} color={colors.muted} />
                        <TextInput
                          value={fullName}
                          onChangeText={setFullName}
                          placeholder="Seu nome"
                          placeholderTextColor={colors.muted}
                          autoCapitalize="words"
                          style={styles.authInput}
                          accessibilityLabel="Nome completo"
                        />
                      </View>
                    </View>
                  )}
                  <View style={styles.authField}>
                    <Text style={styles.authLabel}>{isSignup ? 'Login ou e-mail' : 'Login'}</Text>
                    <View style={styles.authInputWrap}>
                      <Ionicons name="person-outline" size={19} color={colors.muted} />
                      <TextInput
                        value={isSignup ? signupLogin : login}
                        onChangeText={isSignup ? setSignupLogin : setLogin}
                        placeholder={isSignup ? 'voce@exemplo.com' : 'Digite seu login'}
                        placeholderTextColor={colors.muted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType={isSignup ? 'email-address' : 'default'}
                        textContentType={isSignup ? 'username' : 'username'}
                        style={styles.authInput}
                        accessibilityLabel={isSignup ? 'Login ou e-mail' : 'Login'}
                      />
                    </View>
                  </View>
                  <View style={styles.authField}>
                    <Text style={styles.authLabel}>Senha</Text>
                    <View style={styles.authInputWrap}>
                      <Ionicons name="lock-closed-outline" size={19} color={colors.muted} />
                      <TextInput
                        value={isSignup ? signupPassword : password}
                        onChangeText={isSignup ? setSignupPassword : setPassword}
                        placeholder={isSignup ? 'Mínimo de 8 caracteres' : 'Digite sua senha'}
                        placeholderTextColor={colors.muted}
                        secureTextEntry
                        textContentType={isSignup ? 'newPassword' : 'password'}
                        style={styles.authInput}
                        accessibilityLabel="Senha"
                      />
                    </View>
                  </View>
                  {isSignup && (
                    <View style={styles.authField}>
                      <Text style={styles.authLabel}>Confirme sua senha</Text>
                      <View style={styles.authInputWrap}>
                        <Ionicons name="lock-closed-outline" size={19} color={colors.muted} />
                        <TextInput
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          placeholder="Digite a senha novamente"
                          placeholderTextColor={colors.muted}
                          secureTextEntry
                          textContentType="newPassword"
                          style={styles.authInput}
                          accessibilityLabel="Confirme sua senha"
                        />
                      </View>
                    </View>
                  )}

                  {authMessage ? <Text style={styles.authError} accessibilityRole="alert">{authMessage}</Text> : null}
                  <Pressable
                    onPress={isSignup ? submitSignup : submitLogin}
                    style={styles.authPrimaryButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.authPrimaryText}>{isSignup ? 'Criar conta' : 'Entrar'}</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </Pressable>
                  <Pressable
                    onPress={() => { setAuthMessage(''); setAuthScreen(isSignup ? 'login' : 'signup'); }}
                    style={styles.authLinkButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.authLinkText}>
                      {isSignup ? 'Já tem uma conta? ' : 'Ainda não tem uma conta? '}
                      <Text style={styles.authLinkStrong}>{isSignup ? 'Fazer login' : 'Cadastre-se'}</Text>
                    </Text>
                  </Pressable>
              </View>
            </View>
            <Text style={styles.authFooter}>PROTÓTIPO · CONECTE UM SERVIÇO DE AUTENTICAÇÃO</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const completedTasks = tasks.filter((task) => task.done).length;
  const copy = screenCopy[activeTab];
  const mapLatitude = location?.coords.latitude ?? -14.235;
  const mapLongitude = location?.coords.longitude ?? -51.9253;
  const mapSpan = location ? 0.025 : 55;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${mapLongitude - mapSpan}%2C${mapLatitude - mapSpan}%2C${mapLongitude + mapSpan}%2C${mapLatitude + mapSpan}&layer=mapnik${location ? `&marker=${mapLatitude}%2C${mapLongitude}` : ''}`;
  const storedRecordCount = storedItems.reduce((total, { key }) => {
    if (key === TASKS_KEY) return total + tasks.length;
    if (key === PHOTOS_KEY) return total + savedPhotos.length;
    if (key === POSITIONS_KEY) return total + savedPositions.length;
    if (key === HABITS_KEY) return total + habits.length;
    if (key === NOTES_KEY) return total + notes.length;
    return total + 1;
  }, 0);
  const todayKey = localDateKey();
  const todayTasks = tasks
    .filter((task) => task.dueDate && task.dueDate <= todayKey)
    .sort((first, second) => Number(first.done) - Number(second.done));
  const todayOpenTasks = todayTasks.filter((task) => !task.done).length;
  const habitsCompletedToday = habits.filter((habit) => habit.completedDates.includes(todayKey)).length;
  const renderTask = (task: TodoItem) => (
    <View key={task.id} style={styles.taskCard}>
      <View style={styles.taskCardTop}>
        <Pressable
          onPress={() => void toggleTask(task)}
          style={[styles.checkButton, task.done && styles.checkButtonDone]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.done }}
          accessibilityLabel={`Marcar ${task.title} como ${task.done ? 'pendente' : 'concluída'}`}
        >
          {task.done && <Ionicons name="checkmark" size={16} color={colors.white} />}
        </Pressable>
        <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>{task.title}</Text>
        <Pressable onPress={() => void deleteTask(task)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Excluir ${task.title}`}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.taskMetaRow}>
        <Text style={styles.categoryPill}>{task.category ?? 'Pessoal'}</Text>
        <Text style={[styles.priorityPill, task.priority === 'Alta' && styles.priorityHigh, task.priority === 'Baixa' && styles.priorityLow]}>
          {task.priority ?? 'Média'}
        </Text>
        {task.dueDate ? <Text style={styles.taskMetaText}>{task.dueDate < todayKey ? 'Atrasada · ' : 'Prazo · '}{formatLocalDate(task.dueDate)}</Text> : null}
        {task.reminderTime ? <Text style={styles.taskMetaText}>Lembrete · {task.reminderTime}</Text> : null}
      </View>
      {savedPhotos.some((photo) => photo.taskId === task.id) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskPhotoStrip}>
          {savedPhotos.filter((photo) => photo.taskId === task.id).map((photo) => (
            <Image key={photo.id} source={{ uri: photo.uri }} style={styles.taskPhotoPreview} resizeMode="cover" accessibilityLabel={`Foto anexada à tarefa ${task.title}`} />
          ))}
        </ScrollView>
      ) : null}
      <Pressable
        onPress={() => { setSelectedPhotoTaskId(task.id); setPhotoUri(null); setActiveTab('camera'); }}
        style={styles.attachPhotoButton}
        accessibilityRole="button"
        accessibilityLabel={`Adicionar foto à tarefa ${task.title}`}
      >
        <Ionicons name="camera-outline" size={16} color={colors.green} />
        <Text style={styles.attachPhotoText}>Adicionar foto</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <View style={[styles.topBar, isCompactScreen && styles.topBarCompact]}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>A</Text></View>
          <View style={styles.brandTextWrap}><Text style={styles.brandName}>ALFA</Text><Text style={styles.brandCaption}>FERRAMENTAS DO DIA A DIA</Text></View>
          <View style={styles.datePill}><View style={styles.liveDot} /><Text style={styles.dateText}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date())}</Text></View>
        </View>

        <ScrollView contentContainerStyle={[styles.scrollContent, isCompactScreen && styles.scrollContentCompact]} keyboardShouldPersistTaps="handled">
          <View style={styles.pageHeading}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.pageTitle}>{copy.title}</Text>
            <Text style={styles.pageSubtitle}>{copy.subtitle}</Text>
          </View>

          {activeTab === 'todo' && (
            <View style={styles.contentBlock}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.organizerTabs}>
                {ORGANIZER_SECTIONS.map((section) => {
                  const selected = organizerSection === section.id;
                  return (
                    <Pressable
                      key={section.id}
                      onPress={() => setOrganizerSection(section.id)}
                      style={[styles.organizerTab, selected && styles.organizerTabSelected]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                    >
                      <Ionicons name={section.icon} size={16} color={selected ? colors.white : colors.green} />
                      <Text style={[styles.organizerTabText, selected && styles.organizerTabTextSelected]}>{section.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {organizerSection === 'today' && (
                <View style={styles.contentBlock}>
                  <View style={styles.daySummary}>
                    <View style={styles.daySummaryHeader}>
                      <View>
                        <Text style={styles.summaryLabel}>RESUMO DE HOJE</Text>
                        <Text style={styles.daySummaryTitle}>{todayOpenTasks} {todayOpenTasks === 1 ? 'tarefa pendente' : 'tarefas pendentes'}</Text>
                      </View>
                      <View style={styles.progressRing}><Text style={styles.progressNumber}>{habits.length ? `${Math.round((habitsCompletedToday / habits.length) * 100)}%` : '—'}</Text></View>
                    </View>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${habits.length ? (habitsCompletedToday / habits.length) * 100 : 0}%` }]} /></View>
                    <Text style={styles.daySummaryDetail}>{habitsCompletedToday} de {habits.length} hábitos concluídos hoje</Text>
                  </View>
                  <View style={styles.listHeader}><Text style={styles.sectionTitle}>Tarefas com prazo</Text><Text style={styles.countLabel}>{todayTasks.length} ITENS</Text></View>
                  {!tasksReady ? <ActivityIndicator color={colors.green} style={styles.loader} /> : todayTasks.length
                    ? todayTasks.map(renderTask)
                    : <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="sunny-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Seu dia está livre.</Text><Text style={styles.emptyBody}>Adicione uma tarefa com prazo para vê-la neste resumo.</Text></View>}
                  <Pressable onPress={() => setOrganizerSection('tasks')} style={styles.textAction} accessibilityRole="button">
                    <Text style={styles.textActionLabel}>Ver todas as tarefas</Text><Ionicons name="arrow-forward" size={16} color={colors.green} />
                  </Pressable>
                  {habits.length ? (
                    <View style={styles.todayHabits}>
                      <View style={styles.listHeader}><Text style={styles.sectionTitle}>Hábitos de hoje</Text><Text style={styles.countLabel}>{habitsCompletedToday}/{habits.length}</Text></View>
                      {habits.slice(0, 3).map((habit) => (
                        <Pressable key={habit.id} onPress={() => toggleHabitToday(habit)} style={styles.habitCheckRow} accessibilityRole="checkbox" accessibilityState={{ checked: habit.completedDates.includes(todayKey) }}>
                          <View style={[styles.checkButton, habit.completedDates.includes(todayKey) && styles.checkButtonDone]}>
                            {habit.completedDates.includes(todayKey) && <Ionicons name="checkmark" size={16} color={colors.white} />}
                          </View>
                          <Text style={styles.habitCheckTitle}>{habit.title}</Text>
                          <Text style={styles.streakLabel}>{habitStreak(habit.completedDates, todayKey)} dias</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Pressable onPress={() => setOrganizerSection('habits')} style={styles.textAction} accessibilityRole="button">
                      <Text style={styles.textActionLabel}>Criar seu primeiro hábito</Text><Ionicons name="arrow-forward" size={16} color={colors.green} />
                    </Pressable>
                  )}
                </View>
              )}

              {organizerSection === 'tasks' && (
                <View style={styles.contentBlock}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>PROGRESSO GERAL</Text><Text style={styles.summaryTitle}>{completedTasks} de {tasks.length} concluídas</Text></View>
                    <View style={styles.progressRing}><Text style={styles.progressNumber}>{tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0}%</Text></View>
                  </View>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${tasks.length ? (completedTasks / tasks.length) * 100 : 0}%` }]} /></View>
                  <View style={styles.formCard}>
                    <Text style={styles.formTitle}>Nova tarefa</Text>
                    <TextInput value={newTask} onChangeText={(value) => { setNewTask(value); setTaskMessage(''); }} onSubmitEditing={() => void addTask()} placeholder="O que você precisa fazer?" placeholderTextColor={colors.muted} returnKeyType="done" style={styles.taskInput} accessibilityLabel="Nova tarefa" />
                    <Text style={styles.fieldLabel}>CATEGORIA</Text>
                    <View style={styles.choiceRow}>
                      {TASK_CATEGORIES.map((category) => (
                        <Pressable key={category} onPress={() => setTaskCategory(category)} style={[styles.choiceChip, taskCategory === category && styles.choiceChipSelected]} accessibilityRole="button" accessibilityState={{ selected: taskCategory === category }}>
                          <Text style={[styles.choiceChipText, taskCategory === category && styles.choiceChipTextSelected]}>{category}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.fieldLabel}>PRIORIDADE</Text>
                    <View style={styles.choiceRow}>
                      {TASK_PRIORITIES.map((priority) => (
                        <Pressable key={priority} onPress={() => setTaskPriority(priority)} style={[styles.choiceChip, taskPriority === priority && styles.choiceChipSelected]} accessibilityRole="button" accessibilityState={{ selected: taskPriority === priority }}>
                          <Text style={[styles.choiceChipText, taskPriority === priority && styles.choiceChipTextSelected]}>{priority}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.fieldLabel}>PRAZO (OPCIONAL)</Text>
                    <TextInput
                      value={taskDueDate}
                      onChangeText={(value) => { setTaskDueDate(value); setTaskMessage(''); }}
                      placeholder="DD/MM/AAAA"
                      placeholderTextColor={colors.muted}
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                      style={styles.taskInput}
                      accessibilityLabel="Prazo no formato dia mês ano"
                    />
                    <View style={styles.reminderRow}>
                      <View style={styles.reminderCopy}>
                        <Text style={styles.reminderTitle}>Lembrete no aparelho</Text>
                        <Text style={styles.reminderDescription}>Receba uma notificação no prazo escolhido.</Text>
                      </View>
                      <Switch
                        value={taskReminderEnabled}
                        onValueChange={(value) => { setTaskReminderEnabled(value); setTaskMessage(''); }}
                        trackColor={{ false: colors.line, true: colors.mint }}
                        thumbColor={taskReminderEnabled ? colors.green : colors.white}
                        accessibilityLabel="Ativar lembrete para esta tarefa"
                      />
                    </View>
                    {taskReminderEnabled ? (
                      <>
                      <Text style={styles.fieldLabel}>HORÁRIO DO LEMBRETE</Text>
                      <TextInput
                        value={taskReminderTime}
                        onChangeText={(value) => { setTaskReminderTime(value); setTaskMessage(''); }}
                        placeholder="HH:MM"
                        placeholderTextColor={colors.muted}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        style={styles.taskInput}
                        accessibilityLabel="Horário do lembrete"
                      />
                      </>
                    ) : null}
                    {taskMessage ? <Text style={styles.taskMessage} accessibilityRole="alert">{taskMessage}</Text> : null}
                    <Pressable onPress={() => void addTask()} style={styles.primaryButton} accessibilityRole="button">
                      <Ionicons name="add" size={19} color={colors.white} /><Text style={styles.primaryButtonText}>Adicionar tarefa</Text>
                    </Pressable>
                  </View>
                  <View style={styles.listHeader}><Text style={styles.sectionTitle}>Sua lista</Text><Text style={styles.countLabel}>{tasks.length} ITENS</Text></View>
                  {!tasksReady ? <ActivityIndicator color={colors.green} style={styles.loader} /> : tasks.length
                    ? tasks.map(renderTask)
                    : <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="leaf-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Tudo começa com uma tarefa.</Text><Text style={styles.emptyBody}>Adicione algo pequeno para começar.</Text></View>}
                </View>
              )}

              {organizerSection === 'habits' && (
                <View style={styles.contentBlock}>
                  <View style={styles.formCard}>
                    <Text style={styles.formTitle}>Novo hábito diário</Text>
                    <Text style={styles.emptyBody}>Escolha uma rotina pequena que queira acompanhar todos os dias.</Text>
                    <View style={styles.inputRow}>
                      <TextInput value={newHabit} onChangeText={setNewHabit} onSubmitEditing={addHabit} placeholder="Ex.: caminhar 20 minutos" placeholderTextColor={colors.muted} returnKeyType="done" style={styles.taskInput} accessibilityLabel="Nome do novo hábito" />
                      <Pressable onPress={addHabit} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Adicionar hábito"><Ionicons name="add" size={24} color={colors.white} /></Pressable>
                    </View>
                  </View>
                  <View style={styles.listHeader}><Text style={styles.sectionTitle}>Sua rotina</Text><Text style={styles.countLabel}>{habitsCompletedToday}/{habits.length} HOJE</Text></View>
                  {habits.length ? habits.map((habit) => {
                    const doneToday = habit.completedDates.includes(todayKey);
                    return (
                      <View key={habit.id} style={styles.habitCard}>
                        <Pressable onPress={() => toggleHabitToday(habit)} style={[styles.habitCheckButton, doneToday && styles.checkButtonDone]} accessibilityRole="checkbox" accessibilityState={{ checked: doneToday }} accessibilityLabel={`Marcar hábito ${habit.title} como ${doneToday ? 'pendente' : 'concluído'} hoje`}>
                          {doneToday && <Ionicons name="checkmark" size={16} color={colors.white} />}
                        </Pressable>
                        <View style={styles.habitCopy}>
                          <Text style={styles.habitTitle}>{habit.title}</Text>
                          <Text style={styles.habitDetail}>{habitStreak(habit.completedDates, todayKey)} dias seguidos · {habit.completedDates.length} dias no total</Text>
                        </View>
                        <Pressable onPress={() => Alert.alert('Excluir hábito?', `O histórico de “${habit.title}” também será removido.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: () => setHabits((current) => current.filter((item) => item.id !== habit.id)) }])} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Excluir hábito ${habit.title}`}>
                          <Ionicons name="close" size={20} color={colors.muted} />
                        </Pressable>
                      </View>
                    );
                  }) : <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="repeat-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Uma rotina começa pequena.</Text><Text style={styles.emptyBody}>Adicione seu primeiro hábito diário e marque quando concluir.</Text></View>}
                </View>
              )}

              {organizerSection === 'notes' && (
                <View style={styles.contentBlock}>
                  <View style={styles.formCard}>
                    <Text style={styles.formTitle}>{editingNoteId ? 'Editar nota' : 'Anote uma ideia'}</Text>
                    <TextInput value={newNoteTitle} onChangeText={setNewNoteTitle} placeholder="Título (opcional)" placeholderTextColor={colors.muted} style={styles.taskInput} accessibilityLabel="Título da nota" />
                    <TextInput value={newNoteBody} onChangeText={setNewNoteBody} placeholder="Escreva uma nota ou lista rápida..." placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[styles.taskInput, styles.noteInput]} accessibilityLabel="Texto da nota" />
                    <Pressable onPress={addNote} style={styles.primaryButton} accessibilityRole="button">
                      <Ionicons name="save-outline" size={18} color={colors.white} /><Text style={styles.primaryButtonText}>{editingNoteId ? 'Salvar alterações' : 'Salvar nota'}</Text>
                    </Pressable>
                    {editingNoteId ? <Pressable onPress={cancelNoteEdit} style={styles.textAction} accessibilityRole="button"><Text style={styles.textActionLabel}>Cancelar edição</Text></Pressable> : null}
                  </View>
                  <View style={styles.listHeader}><Text style={styles.sectionTitle}>Notas salvas</Text><Text style={styles.countLabel}>{notes.length} ITENS</Text></View>
                  {notes.length ? notes.map((note) => (
                    <View key={note.id} style={styles.noteCard}>
                      <View style={styles.noteHeader}>
                        <View style={styles.noteTitleWrap}><Ionicons name="document-text-outline" size={18} color={colors.green} /><Text style={styles.noteTitle}>{note.title}</Text></View>
                        <Pressable onPress={() => editNote(note)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Editar nota ${note.title}`}><Ionicons name="create-outline" size={17} color={colors.green} /></Pressable>
                        <Pressable onPress={() => { setNotes((current) => current.filter((item) => item.id !== note.id)); if (editingNoteId === note.id) cancelNoteEdit(); }} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Excluir nota ${note.title}`}><Ionicons name="trash-outline" size={17} color={colors.muted} /></Pressable>
                      </View>
                      {note.body ? <Text style={styles.noteBody}>{note.body}</Text> : null}
                      <Text style={styles.noteDate}>Atualizada em {formatDateTime(note.updatedAt)}</Text>
                    </View>
                  )) : <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Guarde uma ideia aqui.</Text><Text style={styles.emptyBody}>Suas notas ficam salvas só neste aparelho.</Text></View>}
                </View>
              )}
            </View>
          )}

          {activeTab === 'security' && (
            <View style={styles.contentBlock}>
              <View style={styles.securityCard}>
                <View style={styles.securityIcon}><Ionicons name="finger-print-outline" size={28} color={colors.green} /></View>
                <View style={styles.securityRow}>
                  <View style={styles.securityCopy}>
                    <Text style={styles.securityTitle}>Cadastro biométrico</Text>
                    <Text style={styles.securityDescription}>
                      {bioState === 'checking'
                        ? 'Verificando os recursos do aparelho...'
                        : bioState === 'missing'
                          ? bioEnabled ? 'Cadastro mantido, mas a biometria está indisponível no aparelho.' : 'Biometria indisponível. Configure-a nas definições do aparelho.'
                          : bioEnabled ? 'Ativado neste aparelho.' : 'Desativado.'}
                    </Text>
                  </View>
                  {bioState === 'checking' || bioBusy ? <ActivityIndicator color={colors.green} /> : (
                    <Switch
                      value={bioEnabled}
                      onValueChange={(enabled) => void setBiometricsEnabled(enabled)}
                      disabled={bioState === 'missing' && !bioEnabled}
                      trackColor={{ false: colors.line, true: colors.mint }}
                      thumbColor={bioEnabled ? colors.green : colors.white}
                      accessibilityLabel="Ativar ou desativar o cadastro biométrico"
                      accessibilityState={{ checked: bioEnabled, disabled: bioState === 'missing' && !bioEnabled }}
                    />
                  )}
                </View>
                {bioMessage ? <Text style={styles.securityMessage} accessibilityRole="alert">{bioMessage}</Text> : null}
                <Text style={styles.securityNote}>
                  O login continua sendo feito com senha. Este cadastro não é solicitado após entrar no app; os dados biométricos permanecem no sistema do aparelho.
                </Text>
              </View>
              <View style={styles.infoLine}><Ionicons name="shield-checkmark-outline" size={18} color={colors.green} /><Text style={styles.infoLineText}>O app guarda apenas o status e a data do cadastro, nunca sua impressão digital ou imagem facial.</Text></View>
            </View>
          )}

          {activeTab === 'map' && (
            <View style={styles.contentBlock}>
              <View style={[styles.mapFrame, isCompactScreen && styles.mapFrameCompact]}>
                <WebView
                  key={mapUrl}
                  source={{ uri: mapUrl }}
                  style={styles.map}
                  originWhitelist={['https://*']}
                  javaScriptEnabled
                  domStorageEnabled
                  startInLoadingState
                  onLoad={() => setMapLoadMessage('')}
                  onError={() => setMapLoadMessage('Não foi possível carregar o mapa. Verifique sua conexão e tente novamente.')}
                  renderLoading={() => (
                    <View style={styles.mapLoading}>
                      <ActivityIndicator color={colors.green} />
                      <Text style={styles.mapLoadingText}>Carregando mapa...</Text>
                    </View>
                  )}
                />
              </View>
              {mapLoadMessage ? <Text style={styles.errorMessage}>{mapLoadMessage}</Text> : null}
              {location ? (
                <Pressable
                  onPress={() => void openMapCredits()}
                  style={styles.mapAttribution}
                  accessibilityRole="link"
                  accessibilityLabel="Créditos do mapa OpenStreetMap"
                >
                  <Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text>
                </Pressable>
              ) : null}
              {location && <View style={styles.coordinateRow}><View><Text style={styles.summaryLabel}>LATITUDE</Text><Text style={styles.coordinateValue}>{location.coords.latitude.toFixed(5)}</Text></View><View style={styles.coordinateDivider} /><View><Text style={styles.summaryLabel}>LONGITUDE</Text><Text style={styles.coordinateValue}>{location.coords.longitude.toFixed(5)}</Text></View><View style={styles.accuracyBadge}><Text style={styles.accuracyText}>±{Math.round(location.coords.accuracy ?? 0)} m</Text></View></View>}
              {locationMessage ? <Text style={styles.errorMessage}>{locationMessage}</Text> : null}
              {locationNeedsSettings ? <Pressable onPress={() => void openLocationSettings()} style={styles.settingsButton} accessibilityRole="button"><Text style={styles.settingsButtonText}>Abrir configurações de localização</Text></Pressable> : null}
              <Pressable onPress={() => void locateMe()} disabled={locationBusy} style={[styles.primaryButton, locationBusy && styles.buttonDisabled]} accessibilityRole="button">{locationBusy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="locate-outline" size={19} color={colors.white} />}<Text style={styles.primaryButtonText}>{locationBusy ? 'Buscando posição...' : location ? 'Atualizar GPS e salvar posição' : 'Ativar GPS e salvar posição'}</Text></Pressable>
              <Text style={styles.permissionFootnote}>{location ? 'O mapa mostra sua posição atual. Toque no botão para atualizar o GPS.' : 'O mapa abre no Brasil. Toque no botão para centralizar na sua posição atual.'}</Text>
            </View>
          )}

          {activeTab === 'camera' && (
            <View style={styles.contentBlock}>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Associar foto a uma tarefa</Text>
                <Text style={styles.emptyBody}>Opcional: escolha uma tarefa para encontrar a foto junto com ela.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                  <Pressable onPress={() => setSelectedPhotoTaskId('')} style={[styles.choiceChip, !selectedPhotoTaskId && styles.choiceChipSelected]} accessibilityRole="button" accessibilityState={{ selected: !selectedPhotoTaskId }}>
                    <Text style={[styles.choiceChipText, !selectedPhotoTaskId && styles.choiceChipTextSelected]}>Sem tarefa</Text>
                  </Pressable>
                  {tasks.map((task) => (
                    <Pressable key={task.id} onPress={() => setSelectedPhotoTaskId(task.id)} style={[styles.choiceChip, selectedPhotoTaskId === task.id && styles.choiceChipSelected]} accessibilityRole="button" accessibilityState={{ selected: selectedPhotoTaskId === task.id }}>
                      <Text style={[styles.choiceChipText, selectedPhotoTaskId === task.id && styles.choiceChipTextSelected]} numberOfLines={1}>{task.title}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {photoTaskId ? <Text style={styles.taskMetaText}>Esta foto está vinculada a: {tasks.find((task) => task.id === photoTaskId)?.title ?? 'Tarefa removida'}</Text> : null}
              </View>
              <View style={styles.cameraFrame}>
                {photoUri ? <Image source={{ uri: photoUri }} style={styles.cameraPreview} resizeMode="cover" /> : cameraPermission?.granted ? <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back" /> : (
                  <View style={styles.cameraEmpty}><View style={styles.cameraIcon}><Ionicons name="camera-outline" size={30} color={colors.green} /></View><Text style={styles.cameraEmptyTitle}>A câmera está pronta quando você estiver.</Text><Text style={styles.cameraEmptyBody}>A permissão será solicitada ao iniciar a captura.</Text></View>
                )}
                {photoUri ? <View style={styles.photoBadge}><Ionicons name="checkmark-circle" size={15} color={colors.green} /><Text style={styles.photoBadgeText}>FOTO CAPTURADA</Text></View> : null}
              </View>
              <View style={styles.cameraActions}>{photoUri ? (
                <Pressable onPress={() => { setPhotoUri(null); setPhotoTaskId(''); }} style={styles.secondaryButton} accessibilityRole="button"><Ionicons name="refresh-outline" size={19} color={colors.ink} /><Text style={styles.secondaryButtonText}>Tirar outra</Text></Pressable>
              ) : <Pressable onPress={() => void takePhoto()} disabled={cameraBusy} style={[styles.primaryButton, styles.cameraCaptureButton, cameraBusy && styles.buttonDisabled]} accessibilityRole="button">{cameraBusy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="radio-button-on" size={20} color={colors.white} />}<Text style={styles.primaryButtonText}>{cameraBusy ? 'Capturando...' : 'Tirar foto'}</Text></Pressable>}</View>
              {cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain ? <Text style={styles.errorMessage}>A câmera está bloqueada. Ative a permissão nas configurações do aparelho.</Text> : null}
            </View>
          )}

          {activeTab === 'storage' && (
            <View style={styles.contentBlock}>
              <View style={styles.storageSummary}><View style={styles.storageIcon}><Ionicons name="server-outline" size={24} color={colors.green} /></View><View style={styles.storageSummaryText}><Text style={styles.summaryLabel}>DADOS SALVOS</Text><Text style={styles.storageCount}>{storedRecordCount} <Text style={styles.storageCountUnit}>registros</Text></Text></View><Pressable onPress={() => void refreshStorage()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Atualizar armazenamento"><Ionicons name="refresh-outline" size={20} color={colors.ink} /></Pressable></View>
              {storageBusy ? <ActivityIndicator color={colors.green} style={styles.loader} /> : storedItems.length ? (
                <View style={styles.storageList}>{storedItems.map(({ key, value }) => key === PHOTOS_KEY ? (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>Fotos salvas ({savedPhotos.length})</Text>
                    <View style={styles.photoGallery}>
                      {savedPhotos.map((photo) => (
                        <View key={photo.id} style={styles.savedPhotoCard}>
                          <Image source={{ uri: photo.uri }} style={styles.savedPhotoPreview} resizeMode="cover" accessibilityLabel="Foto salva no aparelho" />
                          <Text style={styles.savedPhotoDate}>Data e hora: {formatDateTime(photo.savedAt)}</Text>
                          {photo.taskId ? <Text style={styles.savedPhotoDate}>Tarefa: {tasks.find((task) => task.id === photo.taskId)?.title ?? 'Removida'}</Text> : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : key === TASKS_KEY ? (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>Tarefas ({tasks.length})</Text>
                    {tasks.map((task) => (
                      <View key={task.id} style={styles.savedRecord}>
                        <Text style={styles.savedRecordTitle}>Título: {task.title}</Text>
                        <Text style={styles.savedRecordDetail}>Categoria: {task.category ?? 'Pessoal'} · Prioridade: {task.priority ?? 'Média'}</Text>
                        {task.dueDate ? <Text style={styles.savedRecordDetail}>Prazo: {formatLocalDate(task.dueDate)}</Text> : null}
                        {task.reminderTime ? <Text style={styles.savedRecordDetail}>Lembrete: {task.reminderTime}</Text> : null}
                        <Text style={styles.savedRecordDetail}>Data e hora: {formatDateTime(task.createdAt)}</Text>
                      </View>
                    ))}
                  </View>
                ) : key === BIOMETRICS_KEY ? (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>Cadastro Biométrico cadastrado</Text>
                    <Text style={styles.savedRecordDetail}>Data do cadastro: {formatDateTime(parseBiometricDate(value), 'date')}</Text>
                    <Text style={styles.savedRecordDetail}>Hora do cadastro: {formatDateTime(parseBiometricDate(value), 'time')}</Text>
                  </View>
                ) : key === POSITIONS_KEY ? (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>Posições GPS salvas ({savedPositions.length})</Text>
                    {savedPositions.map((position) => (
                      <View key={position.id} style={styles.savedRecord}>
                        <Text style={styles.savedRecordTitle}>Latitude: {formatCoordinates(position.latitude)}</Text>
                        <Text style={styles.savedRecordTitle}>Longitude: {formatCoordinates(position.longitude)}</Text>
                        {position.accuracy !== null ? <Text style={styles.savedRecordDetail}>Precisão: ±{Math.round(position.accuracy)} m</Text> : null}
                        <Text style={styles.savedRecordDetail}>Data e hora: {formatDateTime(position.savedAt)}</Text>
                      </View>
                    ))}
                  </View>
                ) : key === HABITS_KEY ? (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>Hábitos ({habits.length})</Text>
                    {habits.map((habit) => <Text key={habit.id} style={styles.savedRecordDetail}>{habit.title} · {habit.completedDates.length} dias concluídos</Text>)}
                  </View>
                ) : key === NOTES_KEY ? (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>Notas ({notes.length})</Text>
                    {notes.map((note) => <Text key={note.id} style={styles.savedRecordDetail}>{note.title}: {note.body || 'Sem conteúdo'}</Text>)}
                  </View>
                ) : (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>{key.replace(APP_STORAGE_PREFIX, '')}</Text>
                    <Text style={styles.storageValue} numberOfLines={6}>{(() => { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } })()}</Text>
                  </View>
                ))}</View>
              ) : <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="file-tray-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Nenhum dado salvo ainda.</Text><Text style={styles.emptyBody}>Tarefas, hábitos, notas, fotos e cadastros biométricos aparecerão aqui.</Text></View>}
              <Pressable onPress={() => Alert.alert('Limpar dados do app?', 'Isso remove tarefas, hábitos, notas, fotos, posições GPS e o registro biométrico deste aparelho.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Limpar dados', style: 'destructive', onPress: () => void clearStorage() }])} disabled={!storedItems.length || storageBusy} style={[styles.clearButton, (!storedItems.length || storageBusy) && styles.clearButtonDisabled]} accessibilityRole="button"><Ionicons name="trash-outline" size={18} color={storedItems.length ? colors.red : colors.muted} /><Text style={[styles.clearButtonText, !storedItems.length && styles.clearButtonTextDisabled]}>Limpar dados do app</Text></Pressable>
              <Text style={styles.permissionFootnote}>Os dados ficam no armazenamento local deste aparelho.</Text>
            </View>
          )}
          <View style={styles.footer}><View style={styles.footerRule} /><Text style={styles.footerText}>APLICATIVO ALFA <Text style={styles.footerDot}>·</Text> PRIVADO NESTE APARELHO</Text></View>
        </ScrollView>

        <View style={[styles.bottomNav, isCompactScreen && styles.bottomNavCompact]}>{tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.navItem, isCompactScreen && styles.navItemCompact]} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={tab.label}><View style={[styles.navIconWrap, selected && styles.navIconWrapSelected]}><Ionicons name={tab.icon} size={isCompactScreen ? 19 : 21} color={selected ? colors.white : colors.muted} /></View><Text style={[styles.navLabel, isCompactScreen && styles.navLabelCompact, selected && styles.navLabelSelected]} numberOfLines={1}>{tab.label}</Text></Pressable>;
        })}</View>
      </View>
    </SafeAreaView>
  );
}

const colors = { paper: '#F2F4EE', white: '#FFFFFF', ink: '#1C2B24', green: '#2E6B50', greenDark: '#1E4938', mint: '#DCEAE0', muted: '#829087', line: '#DFE5DE', orange: '#D87548', orangeLight: '#F6E5D9', blue: '#456F88', red: '#B55045' };

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper }, appShell: { flex: 1, backgroundColor: colors.paper },
  authShell: { flex: 1, backgroundColor: colors.paper }, authScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }, authScrollCompact: { paddingHorizontal: 16, paddingVertical: 16 },
  authBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 25 }, authBrandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center' }, authBrandName: { color: colors.ink, fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  authCard: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 24, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 }, authCardCompact: { padding: 18 },
  authEyebrow: { color: colors.orange, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 }, authTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 29, lineHeight: 36 }, authSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
  authForm: { gap: 16, marginTop: 25 }, authField: { gap: 7 }, authLabel: { color: colors.ink, fontSize: 12, fontWeight: '700' }, authInputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper }, authInput: { flex: 1, minWidth: 0, height: 50, color: colors.ink, fontSize: 14 },
  authPrimaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.green }, authPrimaryText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  authLinkButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' }, authLinkText: { color: colors.muted, fontSize: 12 }, authLinkStrong: { color: colors.green, fontWeight: '800' }, authError: { color: colors.red, fontSize: 12, lineHeight: 18 }, authFooter: { alignSelf: 'center', color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center', marginTop: 25 },
  topBar: { minHeight: 70, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line }, topBarCompact: { minHeight: 62, paddingHorizontal: 14 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: colors.white, fontFamily: 'Georgia', fontSize: 22, fontWeight: '700' }, brandTextWrap: { marginLeft: 10 }, brandName: { color: colors.ink, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 }, brandCaption: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginTop: 3 },
  datePill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.white }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.orange }, dateText: { color: colors.ink, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  scrollContent: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28 }, scrollContentCompact: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20 }, pageHeading: { marginBottom: 22 }, eyebrow: { color: colors.orange, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 9 }, pageTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 32, lineHeight: 38 }, pageSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 }, contentBlock: { gap: 16 },
  organizerTabs: { gap: 8, paddingBottom: 2 }, organizerTab: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, organizerTabSelected: { borderColor: colors.green, backgroundColor: colors.green }, organizerTabText: { color: colors.ink, fontSize: 12, fontWeight: '700' }, organizerTabTextSelected: { color: colors.white },
  daySummary: { gap: 13, padding: 17, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, daySummaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, daySummaryTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 20, marginTop: 5 }, daySummaryDetail: { color: colors.muted, fontSize: 11 }, textAction: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, textActionLabel: { color: colors.green, fontSize: 12, fontWeight: '700' }, todayHabits: { gap: 7, marginTop: 5 }, habitCheckRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.white }, habitCheckTitle: { flex: 1, color: colors.ink, fontSize: 13 }, streakLabel: { color: colors.green, fontSize: 10, fontWeight: '700' },
  formCard: { gap: 12, padding: 16, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, formTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 19 }, fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, choiceChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line }, choiceChipSelected: { borderColor: colors.green, backgroundColor: colors.green }, choiceChipText: { maxWidth: 190, color: colors.ink, fontSize: 11, fontWeight: '600' }, choiceChipTextSelected: { color: colors.white }, reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, reminderCopy: { flex: 1, gap: 3 }, reminderTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, reminderDescription: { color: colors.muted, fontSize: 10, lineHeight: 15 }, taskMessage: { color: colors.red, fontSize: 12, lineHeight: 18 },
  taskCard: { gap: 10, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, taskCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, taskMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 32 }, categoryPill: { color: colors.greenDark, fontSize: 9, fontWeight: '700', backgroundColor: colors.mint, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 }, priorityPill: { color: colors.blue, fontSize: 9, fontWeight: '700', backgroundColor: '#E7EEF1', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 }, priorityHigh: { color: colors.red, backgroundColor: '#F8E9E5' }, priorityLow: { color: colors.muted, backgroundColor: colors.paper }, taskMetaText: { color: colors.muted, fontSize: 10 }, attachPhotoButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginLeft: 29, paddingHorizontal: 8 }, attachPhotoText: { color: colors.green, fontSize: 11, fontWeight: '700' }, taskPhotoStrip: { gap: 8, paddingLeft: 32 }, taskPhotoPreview: { width: 64, height: 64, borderRadius: 9, backgroundColor: colors.paper },
  habitCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, habitCheckButton: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: '#B6C5B9', alignItems: 'center', justifyContent: 'center' }, habitCopy: { flex: 1, gap: 4 }, habitTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, habitDetail: { color: colors.muted, fontSize: 10 }, noteInput: { minHeight: 100, paddingTop: 13 }, noteCard: { gap: 10, padding: 14, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, noteTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }, noteTitle: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }, noteBody: { color: colors.ink, fontSize: 12, lineHeight: 19 }, noteDate: { color: colors.muted, fontSize: 9 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryCopy: { gap: 5 }, summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }, summaryTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, progressRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' }, progressNumber: { color: colors.green, fontSize: 12, fontWeight: '800' }, progressTrack: { height: 5, backgroundColor: colors.line, borderRadius: 4, overflow: 'hidden' }, progressFill: { height: 5, borderRadius: 4, backgroundColor: colors.green },
  inputRow: { flexDirection: 'row', gap: 9 }, taskInput: { flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 15, color: colors.ink, fontSize: 14 }, addButton: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green }, listHeader: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 21 }, countLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  taskRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 }, checkButton: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#B6C5B9', alignItems: 'center', justifyContent: 'center' }, checkButtonDone: { borderColor: colors.green, backgroundColor: colors.green }, taskTitle: { flex: 1, color: colors.ink, fontSize: 14 }, taskTitleDone: { color: colors.muted, textDecorationLine: 'line-through' }, removeButton: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }, emptyState: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14 }, emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }, emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, emptyBody: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 }, loader: { paddingVertical: 22 },
  securityCard: { padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, securityIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, securityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, securityCopy: { flex: 1, gap: 5 }, securityTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, securityDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 }, securityMessage: { color: colors.red, fontSize: 12, lineHeight: 18, marginTop: 12 }, securityNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line }, primaryButton: { minHeight: 50, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.green }, primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'center' }, infoLine: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingHorizontal: 4 }, infoLineText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
  mapFrame: { width: '100%', height: 300, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: '#E6EDE7' }, mapFrameCompact: { height: 250 }, map: { flex: 1 }, mapLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.paper }, mapLoadingText: { color: colors.muted, fontSize: 12 }, mapAttribution: { alignSelf: 'flex-start', marginTop: -8 }, mapAttributionText: { color: colors.green, fontSize: 10, textDecorationLine: 'underline' }, settingsButton: { alignSelf: 'center', paddingVertical: 8 }, settingsButtonText: { color: colors.green, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }, coordinateRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, coordinateValue: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 5 }, coordinateDivider: { width: 1, height: 31, backgroundColor: colors.line }, accuracyBadge: { marginLeft: 'auto', backgroundColor: colors.mint, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 }, accuracyText: { color: colors.greenDark, fontSize: 10, fontWeight: '700' }, permissionFootnote: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 }, errorMessage: { color: colors.red, fontSize: 12, lineHeight: 18 }, buttonDisabled: { opacity: 0.7 },
  cameraFrame: { height: 370, width: '100%', borderRadius: 15, overflow: 'hidden', backgroundColor: '#E5EAE5', borderWidth: 1, borderColor: colors.line }, cameraPreview: { width: '100%', height: '100%' }, cameraEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 }, cameraIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, cameraEmptyTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 18, lineHeight: 24, textAlign: 'center' }, cameraEmptyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, photoBadge: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 }, photoBadgeText: { color: colors.greenDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }, cameraActions: { alignItems: 'center' }, cameraCaptureButton: { maxWidth: 260 }, secondaryButton: { minHeight: 48, paddingHorizontal: 19, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  storageSummary: { minHeight: 82, flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, gap: 12 }, storageIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }, storageSummaryText: { flex: 1, gap: 4 }, storageCount: { color: colors.ink, fontSize: 19, fontWeight: '800' }, storageCountUnit: { color: colors.muted, fontSize: 11, fontWeight: '500' }, iconButton: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, storageList: { borderTopWidth: 1, borderTopColor: colors.line }, storageEntry: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 7 }, storageKey: { color: colors.green, fontSize: 11, fontWeight: '800' }, storageValue: { color: colors.ink, fontSize: 11, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, savedRecord: { gap: 4, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.paper }, savedRecordTitle: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 }, savedRecordDetail: { color: colors.muted, fontSize: 11, lineHeight: 16 }, photoGallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, savedPhotoCard: { width: 104, maxWidth: '100%', flexGrow: 1, flexBasis: 90, gap: 5 }, savedPhotoPreview: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.paper }, savedPhotoDate: { color: colors.muted, fontSize: 9, lineHeight: 14 }, clearButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#E8C7C1', borderRadius: 11, backgroundColor: colors.white }, clearButtonDisabled: { borderColor: colors.line }, clearButtonText: { color: colors.red, fontSize: 12, fontWeight: '700', flexShrink: 1 }, clearButtonTextDisabled: { color: colors.muted }, footer: { alignItems: 'center', marginTop: 34, gap: 11 }, footerRule: { width: 38, height: 2, backgroundColor: colors.orange, borderRadius: 2 }, footerText: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 }, footerDot: { color: colors.orange },
  bottomNav: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5, paddingTop: 7, paddingBottom: Platform.OS === 'ios' ? 8 : 4, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }, bottomNavCompact: { minHeight: 68, paddingHorizontal: 2 }, navItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }, navItemCompact: { gap: 3 }, navIconWrap: { width: 37, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, navIconWrapSelected: { backgroundColor: colors.green }, navLabel: { color: colors.muted, fontSize: 9, fontWeight: '600' }, navLabelCompact: { fontSize: 8 }, navLabelSelected: { color: colors.greenDark, fontWeight: '800' },
});
