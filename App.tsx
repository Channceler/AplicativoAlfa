import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
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
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

type TabId = 'todo' | 'biometrics' | 'map' | 'camera' | 'storage';
type AuthScreen = 'login' | 'signup' | 'biometric' | 'app';
type TodoItem = { id: string; title: string; done: boolean; createdAt?: string };
type StoredItem = { key: string; value: string };
type SavedPhoto = { id: string; uri: string; savedAt: string };
type SavedPosition = { id: string; latitude: number; longitude: number; accuracy: number | null; savedAt: string };

const TASKS_KEY = '@aplicativo-alfa/tasks/v1';
const PHOTOS_KEY = '@aplicativo-alfa/photos/v1';
const BIOMETRICS_KEY = '@aplicativo-alfa/biometrics/v1';
const POSITIONS_KEY = '@aplicativo-alfa/positions/v1';
const APP_STORAGE_PREFIX = '@aplicativo-alfa/';
const MAX_SAVED_POSITIONS = 50;

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
  { id: 'todo', label: 'Tarefas', icon: 'checkbox-outline' },
  { id: 'biometrics', label: 'Biometria', icon: 'finger-print-outline' },
  { id: 'map', label: 'Mapa', icon: 'map-outline' },
  { id: 'camera', label: 'Câmera', icon: 'camera-outline' },
  { id: 'storage', label: 'Dados', icon: 'server-outline' },
];

const screenCopy: Record<TabId, { eyebrow: string; title: string; subtitle: string }> = {
  todo: { eyebrow: 'ESPAÇO PESSOAL', title: 'Um passo de cada vez.', subtitle: 'Sua lista fica guardada neste aparelho.' },
  biometrics: { eyebrow: 'ACESSO SEGURO', title: 'Só você pode entrar.', subtitle: 'Confirme sua identidade com a segurança do aparelho.' },
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
  const [tasks, setTasks] = useState<TodoItem[]>([]);
  const [tasksReady, setTasksReady] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [bioState, setBioState] = useState<'checking' | 'ready' | 'missing' | 'success' | 'failed'>('checking');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationNeedsSettings, setLocationNeedsSettings] = useState(false);
  const [mapLoadMessage, setMapLoadMessage] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [savedPositions, setSavedPositions] = useState<SavedPosition[]>([]);
  const [storedItems, setStoredItems] = useState<StoredItem[]>([]);
  const [storageBusy, setStorageBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const skipNextTaskSave = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const isCompactScreen = screenWidth < 360;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(TASKS_KEY)
      .then((value) => { if (mounted && value) setTasks(JSON.parse(value) as TodoItem[]); })
      .catch(() => Alert.alert('Não foi possível carregar as tarefas', 'Tente abrir a lista novamente.'))
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
    if (activeTab !== 'biometrics') return;
    let mounted = true;
    setBioState('checking');
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hasHardware, isEnrolled]) => { if (mounted) setBioState(hasHardware && isEnrolled ? 'ready' : 'missing'); })
      .catch(() => { if (mounted) setBioState('missing'); });
    return () => { mounted = false; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'storage') void refreshStorage();
  }, [activeTab]);

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setTasks((current) => [{ id: `${Date.now()}`, title, done: false, createdAt: new Date().toISOString() }, ...current]);
    setNewTask('');
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
    if (!keys.length) return;
    try {
      const documentDirectory = FileSystem.documentDirectory;
      if (!documentDirectory) throw new Error('O armazenamento permanente não está disponível.');
      const photosDirectory = `${documentDirectory}aplicativo-alfa/photos/`;
      const directoryInfo = await FileSystem.getInfoAsync(photosDirectory);
      if (directoryInfo.exists) await FileSystem.deleteAsync(photosDirectory, { idempotent: true });
      await AsyncStorage.multiRemove(keys);
      skipNextTaskSave.current = true;
      setTasks([]);
      setSavedPhotos([]);
      setSavedPositions([]);
      setPhotoUri(null);
      await refreshStorage();
    } catch {
      Alert.alert('Falha ao limpar dados', 'Tente novamente.');
    }
  }

  async function authenticate() {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirmar identidade' });
      if (result.success) {
        setBioState('success');
        await saveBiometricRegistration();
      } else {
        setBioState('failed');
      }
    } catch {
      setBioState('failed');
      Alert.alert('Biometria não salva', 'A verificação não foi concluída ou não foi possível salvar o registro biométrico.');
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
      const savedPhoto: SavedPhoto = { id, uri: destinationUri, savedAt: new Date().toISOString() };
      await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify([savedPhoto, ...existingPhotos]));
      setPhotoUri(destinationUri);
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
    setAuthScreen('biometric');
  }

  async function registerBiometrics() {
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        setAuthMessage('Configure a biometria nas definições do aparelho e tente novamente.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirmar cadastro biométrico',
      });
      if (result.success) {
        try {
          await saveBiometricRegistration();
          setAuthMessage('');
          setAuthScreen('app');
        } catch {
          setAuthMessage('A biometria foi confirmada, mas não foi possível salvar o registro. Tente novamente.');
        }
      } else {
        setAuthMessage('Não foi possível confirmar sua biometria. Tente novamente ou continue sem ela.');
      }
    } catch {
      setAuthMessage('O cadastro biométrico não está disponível neste aparelho.');
    }
  }

  if (authScreen !== 'app') {
    const isSignup = authScreen === 'signup';
    const isBiometric = authScreen === 'biometric';

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
              <Text style={styles.authEyebrow}>
                {isBiometric ? 'ACESSO SEGURO' : isSignup ? 'NOVA CONTA' : 'SEJA BEM-VINDO'}
              </Text>
              <Text style={styles.authTitle}>
                {isBiometric ? 'Cadastro de Biometria' : isSignup ? 'Cadastre-se' : 'Login'}
              </Text>
              <Text style={styles.authSubtitle}>
                {isBiometric
                  ? 'Use a segurança do seu aparelho para confirmar sua identidade.'
                  : isSignup
                    ? 'Crie sua conta para começar a usar o Aplicativo Alfa.'
                    : 'Entre com seus dados para acessar o Aplicativo Alfa.'}
              </Text>

              {isBiometric ? (
                <View style={styles.authForm}>
                  <View style={styles.authBiometricIcon}>
                    <Ionicons name="finger-print-outline" size={54} color={colors.green} />
                  </View>
                  <Text style={styles.authBiometricCopy}>
                    A biometria é verificada pelo sistema do aparelho. O app não recebe nem armazena seus dados biométricos.
                  </Text>
                  <Pressable onPress={() => void registerBiometrics()} style={styles.authPrimaryButton} accessibilityRole="button">
                    <Ionicons name="shield-checkmark-outline" size={19} color={colors.white} />
                    <Text style={styles.authPrimaryText}>Cadastrar biometria</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setAuthMessage(''); setAuthScreen('app'); }}
                    style={styles.authSecondaryButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.authSecondaryText}>Continuar sem biometria</Text>
                  </Pressable>
                </View>
              ) : (
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
              )}
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
    return total + 1;
  }, 0);

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
              <View style={styles.summaryRow}>
                <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>PROGRESSO DE HOJE</Text><Text style={styles.summaryTitle}>{completedTasks} de {tasks.length} concluídas</Text></View>
                <View style={styles.progressRing}><Text style={styles.progressNumber}>{tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0}%</Text></View>
              </View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${tasks.length ? (completedTasks / tasks.length) * 100 : 0}%` }]} /></View>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.inputRow}>
                  <TextInput value={newTask} onChangeText={setNewTask} onSubmitEditing={() => void addTask()} placeholder="Adicionar uma tarefa..." placeholderTextColor={colors.muted} returnKeyType="done" style={styles.taskInput} accessibilityLabel="Nova tarefa" />
                  <Pressable onPress={() => void addTask()} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Adicionar tarefa"><Ionicons name="add" size={24} color={colors.white} /></Pressable>
                </View>
              </KeyboardAvoidingView>
              <View style={styles.listHeader}><Text style={styles.sectionTitle}>Sua lista</Text><Text style={styles.countLabel}>{tasks.length} ITENS</Text></View>
              {!tasksReady ? <ActivityIndicator color={colors.green} style={styles.loader} /> : tasks.length === 0 ? (
                <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="leaf-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Tudo começa com uma tarefa.</Text><Text style={styles.emptyBody}>Adicione algo pequeno para começar.</Text></View>
              ) : tasks.map((task) => (
                <View key={task.id} style={styles.taskRow}>
                  <Pressable onPress={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} style={[styles.checkButton, task.done && styles.checkButtonDone]} accessibilityRole="checkbox" accessibilityState={{ checked: task.done }} accessibilityLabel={`Marcar ${task.title} como ${task.done ? 'pendente' : 'concluída'}`}>
                    {task.done && <Ionicons name="checkmark" size={16} color={colors.white} />}
                  </Pressable>
                  <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>{task.title}</Text>
                  <Pressable onPress={() => setTasks((current) => current.filter((item) => item.id !== task.id))} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Excluir ${task.title}`}><Ionicons name="close" size={20} color={colors.muted} /></Pressable>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'biometrics' && (
            <View style={styles.contentBlock}>
              <View style={[styles.bioPanel, isCompactScreen && styles.bioPanelCompact]}>
                <View style={[styles.bioIcon, bioState === 'success' && styles.bioIconSuccess]}><Ionicons name="finger-print" size={54} color={bioState === 'success' ? colors.white : colors.green} /></View>
                <Text style={styles.bioTitle}>{bioState === 'success' ? 'Identidade confirmada' : 'Proteção do aparelho'}</Text>
                <Text style={styles.bioBody}>{bioState === 'checking' ? 'Verificando os recursos de segurança...' : bioState === 'missing' ? 'Este aparelho não tem biometria configurada. Configure Face ID ou impressão digital nas definições do sistema.' : bioState === 'success' ? 'A autenticação foi concluída com sucesso.' : bioState === 'failed' ? 'A autenticação não foi concluída. Você pode tentar novamente.' : 'Use a biometria ou o código de acesso configurado no seu aparelho.'}</Text>
                {bioState === 'checking' ? <ActivityIndicator color={colors.green} style={styles.actionLoader} /> : bioState === 'missing' ? (
                  <View style={styles.noticeBox}><Ionicons name="information-circle-outline" size={19} color={colors.orange} /><Text style={styles.noticeText}>Disponibilidade depende do aparelho e da configuração local.</Text></View>
                ) : <Pressable onPress={() => void authenticate()} style={styles.primaryButton} accessibilityRole="button"><Ionicons name="lock-open-outline" size={19} color={colors.white} /><Text style={styles.primaryButtonText}>{bioState === 'success' ? 'Autenticar novamente' : 'Confirmar com biometria'}</Text></Pressable>}
              </View>
              <View style={styles.infoLine}><Ionicons name="shield-checkmark-outline" size={18} color={colors.green} /><Text style={styles.infoLineText}>A verificação é feita pelo sistema do seu aparelho. O app não recebe seus dados biométricos.</Text></View>
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
              <View style={styles.cameraFrame}>
                {photoUri ? <Image source={{ uri: photoUri }} style={styles.cameraPreview} resizeMode="cover" /> : cameraPermission?.granted ? <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back" /> : (
                  <View style={styles.cameraEmpty}><View style={styles.cameraIcon}><Ionicons name="camera-outline" size={30} color={colors.green} /></View><Text style={styles.cameraEmptyTitle}>A câmera está pronta quando você estiver.</Text><Text style={styles.cameraEmptyBody}>A permissão será solicitada ao iniciar a captura.</Text></View>
                )}
                {photoUri ? <View style={styles.photoBadge}><Ionicons name="checkmark-circle" size={15} color={colors.green} /><Text style={styles.photoBadgeText}>FOTO CAPTURADA</Text></View> : null}
              </View>
              <View style={styles.cameraActions}>{photoUri ? (
                <Pressable onPress={() => setPhotoUri(null)} style={styles.secondaryButton} accessibilityRole="button"><Ionicons name="refresh-outline" size={19} color={colors.ink} /><Text style={styles.secondaryButtonText}>Tirar outra</Text></Pressable>
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
                ) : (
                  <View key={key} style={styles.storageEntry}>
                    <Text style={styles.storageKey}>{key.replace(APP_STORAGE_PREFIX, '')}</Text>
                    <Text style={styles.storageValue} numberOfLines={6}>{(() => { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } })()}</Text>
                  </View>
                ))}</View>
              ) : <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="file-tray-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Nenhum dado salvo ainda.</Text><Text style={styles.emptyBody}>Tarefas, fotos e cadastros biométricos aparecerão aqui.</Text></View>}
              <Pressable onPress={() => Alert.alert('Limpar dados do app?', 'Isso remove as tarefas, fotos, posições GPS e o registro biométrico salvos neste aparelho.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Limpar dados', style: 'destructive', onPress: () => void clearStorage() }])} disabled={!storedItems.length || storageBusy} style={[styles.clearButton, (!storedItems.length || storageBusy) && styles.clearButtonDisabled]} accessibilityRole="button"><Ionicons name="trash-outline" size={18} color={storedItems.length ? colors.red : colors.muted} /><Text style={[styles.clearButtonText, !storedItems.length && styles.clearButtonTextDisabled]}>Limpar dados do app</Text></Pressable>
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
  authPrimaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.green }, authPrimaryText: { color: colors.white, fontSize: 14, fontWeight: '700' }, authSecondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, authSecondaryText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  authLinkButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' }, authLinkText: { color: colors.muted, fontSize: 12 }, authLinkStrong: { color: colors.green, fontWeight: '800' }, authError: { color: colors.red, fontSize: 12, lineHeight: 18 }, authBiometricIcon: { width: 104, height: 104, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 34, backgroundColor: colors.mint }, authBiometricCopy: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' }, authFooter: { alignSelf: 'center', color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center', marginTop: 25 },
  topBar: { minHeight: 70, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line }, topBarCompact: { minHeight: 62, paddingHorizontal: 14 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: colors.white, fontFamily: 'Georgia', fontSize: 22, fontWeight: '700' }, brandTextWrap: { marginLeft: 10 }, brandName: { color: colors.ink, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 }, brandCaption: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginTop: 3 },
  datePill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.white }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.orange }, dateText: { color: colors.ink, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  scrollContent: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28 }, scrollContentCompact: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20 }, pageHeading: { marginBottom: 22 }, eyebrow: { color: colors.orange, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 9 }, pageTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 32, lineHeight: 38 }, pageSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 }, contentBlock: { gap: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryCopy: { gap: 5 }, summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }, summaryTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, progressRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' }, progressNumber: { color: colors.green, fontSize: 12, fontWeight: '800' }, progressTrack: { height: 5, backgroundColor: colors.line, borderRadius: 4, overflow: 'hidden' }, progressFill: { height: 5, borderRadius: 4, backgroundColor: colors.green },
  inputRow: { flexDirection: 'row', gap: 9 }, taskInput: { flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 15, color: colors.ink, fontSize: 14 }, addButton: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green }, listHeader: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 21 }, countLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  taskRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 }, checkButton: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#B6C5B9', alignItems: 'center', justifyContent: 'center' }, checkButtonDone: { borderColor: colors.green, backgroundColor: colors.green }, taskTitle: { flex: 1, color: colors.ink, fontSize: 14 }, taskTitleDone: { color: colors.muted, textDecorationLine: 'line-through' }, removeButton: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }, emptyState: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14 }, emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }, emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, emptyBody: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 }, loader: { paddingVertical: 22 },
  bioPanel: { alignItems: 'center', padding: 22, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, bioPanelCompact: { padding: 16 }, bioIcon: { width: 106, height: 106, borderRadius: 36, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 17 }, bioIconSuccess: { backgroundColor: colors.green }, bioTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 21, textAlign: 'center' }, bioBody: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 18 }, primaryButton: { minHeight: 50, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.green }, primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'center' }, actionLoader: { marginVertical: 15 }, noticeBox: { width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.orangeLight, borderRadius: 10, padding: 11 }, noticeText: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 16 }, infoLine: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingHorizontal: 4 }, infoLineText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
  mapFrame: { width: '100%', height: 300, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: '#E6EDE7' }, mapFrameCompact: { height: 250 }, map: { flex: 1 }, mapLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.paper }, mapLoadingText: { color: colors.muted, fontSize: 12 }, mapAttribution: { alignSelf: 'flex-start', marginTop: -8 }, mapAttributionText: { color: colors.green, fontSize: 10, textDecorationLine: 'underline' }, settingsButton: { alignSelf: 'center', paddingVertical: 8 }, settingsButtonText: { color: colors.green, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }, coordinateRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, coordinateValue: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 5 }, coordinateDivider: { width: 1, height: 31, backgroundColor: colors.line }, accuracyBadge: { marginLeft: 'auto', backgroundColor: colors.mint, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 }, accuracyText: { color: colors.greenDark, fontSize: 10, fontWeight: '700' }, permissionFootnote: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 }, errorMessage: { color: colors.red, fontSize: 12, lineHeight: 18 }, buttonDisabled: { opacity: 0.7 },
  cameraFrame: { height: 370, width: '100%', borderRadius: 15, overflow: 'hidden', backgroundColor: '#E5EAE5', borderWidth: 1, borderColor: colors.line }, cameraPreview: { width: '100%', height: '100%' }, cameraEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 }, cameraIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, cameraEmptyTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 18, lineHeight: 24, textAlign: 'center' }, cameraEmptyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, photoBadge: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 }, photoBadgeText: { color: colors.greenDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }, cameraActions: { alignItems: 'center' }, cameraCaptureButton: { maxWidth: 260 }, secondaryButton: { minHeight: 48, paddingHorizontal: 19, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  storageSummary: { minHeight: 82, flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, gap: 12 }, storageIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }, storageSummaryText: { flex: 1, gap: 4 }, storageCount: { color: colors.ink, fontSize: 19, fontWeight: '800' }, storageCountUnit: { color: colors.muted, fontSize: 11, fontWeight: '500' }, iconButton: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, storageList: { borderTopWidth: 1, borderTopColor: colors.line }, storageEntry: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 7 }, storageKey: { color: colors.green, fontSize: 11, fontWeight: '800' }, storageValue: { color: colors.ink, fontSize: 11, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, savedRecord: { gap: 4, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.paper }, savedRecordTitle: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 }, savedRecordDetail: { color: colors.muted, fontSize: 11, lineHeight: 16 }, photoGallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, savedPhotoCard: { width: 104, maxWidth: '100%', flexGrow: 1, flexBasis: 90, gap: 5 }, savedPhotoPreview: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.paper }, savedPhotoDate: { color: colors.muted, fontSize: 9, lineHeight: 14 }, clearButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#E8C7C1', borderRadius: 11, backgroundColor: colors.white }, clearButtonDisabled: { borderColor: colors.line }, clearButtonText: { color: colors.red, fontSize: 12, fontWeight: '700', flexShrink: 1 }, clearButtonTextDisabled: { color: colors.muted }, footer: { alignItems: 'center', marginTop: 34, gap: 11 }, footerRule: { width: 38, height: 2, backgroundColor: colors.orange, borderRadius: 2 }, footerText: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 }, footerDot: { color: colors.orange },
  bottomNav: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5, paddingTop: 7, paddingBottom: Platform.OS === 'ios' ? 8 : 4, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }, bottomNavCompact: { minHeight: 68, paddingHorizontal: 2 }, navItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }, navItemCompact: { gap: 3 }, navIconWrap: { width: 37, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, navIconWrapSelected: { backgroundColor: colors.green }, navLabel: { color: colors.muted, fontSize: 9, fontWeight: '600' }, navLabelCompact: { fontSize: 8 }, navLabelSelected: { color: colors.greenDark, fontWeight: '800' },
});
