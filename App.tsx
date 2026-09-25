import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import MapView, { Marker, type Region } from 'react-native-maps';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type TabId = 'todo' | 'biometrics' | 'map' | 'camera' | 'storage';
type TodoItem = { id: string; title: string; done: boolean };
type StoredItem = { key: string; value: string };

const TASKS_KEY = '@aplicativo-alfa/tasks/v1';
const APP_STORAGE_PREFIX = '@aplicativo-alfa/';

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
  const [activeTab, setActiveTab] = useState<TabId>('todo');
  const [tasks, setTasks] = useState<TodoItem[]>([]);
  const [tasksReady, setTasksReady] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [bioState, setBioState] = useState<'checking' | 'ready' | 'missing' | 'success' | 'failed'>('checking');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [storedItems, setStoredItems] = useState<StoredItem[]>([]);
  const [storageBusy, setStorageBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const skipNextTaskSave = useRef(false);

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
    setTasks((current) => [{ id: `${Date.now()}`, title, done: false }, ...current]);
    setNewTask('');
  }

  async function refreshStorage() {
    setStorageBusy(true);
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(APP_STORAGE_PREFIX));
      const pairs = await AsyncStorage.multiGet(keys);
      setStoredItems(pairs.map(([key, value]) => ({ key, value: value ?? '' })));
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
      await AsyncStorage.multiRemove(keys);
      skipNextTaskSave.current = true;
      setTasks([]);
      await refreshStorage();
    } catch {
      Alert.alert('Falha ao limpar dados', 'Tente novamente.');
    }
  }

  async function authenticate() {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirmar identidade' });
      setBioState(result.success ? 'success' : 'failed');
    } catch {
      setBioState('failed');
    }
  }

  async function locateMe() {
    setLocationBusy(true);
    setLocationMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationMessage('A permissão de localização foi negada. Você pode ativá-la nas configurações do aparelho.');
        return;
      }
      setLocation(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    } catch {
      setLocationMessage('Não foi possível obter sua posição. Verifique se o GPS está ligado.');
    } finally {
      setLocationBusy(false);
    }
  }

  async function takePhoto() {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return;
    }
    setCameraBusy(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.82 });
      if (photo?.uri) setPhotoUri(photo.uri);
    } catch {
      Alert.alert('Não foi possível tirar a foto', 'Tente novamente.');
    } finally {
      setCameraBusy(false);
    }
  }

  const completedTasks = tasks.filter((task) => task.done).length;
  const copy = screenCopy[activeTab];
  const mapRegion: Region | undefined = location ? {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  } : undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <View style={styles.topBar}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>A</Text></View>
          <View style={styles.brandTextWrap}><Text style={styles.brandName}>ALFA</Text><Text style={styles.brandCaption}>FERRAMENTAS DO DIA A DIA</Text></View>
          <View style={styles.datePill}><View style={styles.liveDot} /><Text style={styles.dateText}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date())}</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
              <View style={styles.bioPanel}>
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
              <View style={styles.mapFrame}>
                {mapRegion && location ? (
                  <MapView style={styles.map} region={mapRegion} showsUserLocation showsMyLocationButton><Marker coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }} title="Você está aqui" /></MapView>
                ) : <View style={styles.mapEmpty}><View style={styles.mapTarget}><Ionicons name="navigate" size={26} color={colors.green} /></View><Text style={styles.mapEmptyTitle}>Sua posição aparece aqui</Text><Text style={styles.mapEmptyBody}>Ative o GPS para centralizar o mapa na sua localização atual.</Text></View>}
              </View>
              {location && <View style={styles.coordinateRow}><View><Text style={styles.summaryLabel}>LATITUDE</Text><Text style={styles.coordinateValue}>{location.coords.latitude.toFixed(5)}</Text></View><View style={styles.coordinateDivider} /><View><Text style={styles.summaryLabel}>LONGITUDE</Text><Text style={styles.coordinateValue}>{location.coords.longitude.toFixed(5)}</Text></View><View style={styles.accuracyBadge}><Text style={styles.accuracyText}>±{Math.round(location.coords.accuracy ?? 0)} m</Text></View></View>}
              {locationMessage ? <Text style={styles.errorMessage}>{locationMessage}</Text> : null}
              <Pressable onPress={() => void locateMe()} disabled={locationBusy} style={[styles.primaryButton, locationBusy && styles.buttonDisabled]} accessibilityRole="button">{locationBusy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="locate-outline" size={19} color={colors.white} />}<Text style={styles.primaryButtonText}>{locationBusy ? 'Buscando posição...' : location ? 'Atualizar posição' : 'Encontrar minha posição'}</Text></Pressable>
              <Text style={styles.permissionFootnote}>Sua localização só é acessada quando você toca no botão.</Text>
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
              <View style={styles.storageSummary}><View style={styles.storageIcon}><Ionicons name="server-outline" size={24} color={colors.green} /></View><View style={styles.storageSummaryText}><Text style={styles.summaryLabel}>CHAVES DO APP</Text><Text style={styles.storageCount}>{storedItems.length} <Text style={styles.storageCountUnit}>registros</Text></Text></View><Pressable onPress={() => void refreshStorage()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Atualizar armazenamento"><Ionicons name="refresh-outline" size={20} color={colors.ink} /></Pressable></View>
              {storageBusy ? <ActivityIndicator color={colors.green} style={styles.loader} /> : storedItems.length ? (
                <View style={styles.storageList}>{storedItems.map(({ key, value }) => <View key={key} style={styles.storageEntry}><Text style={styles.storageKey}>{key.replace(APP_STORAGE_PREFIX, '')}</Text><Text style={styles.storageValue} numberOfLines={6}>{(() => { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } })()}</Text></View>)}</View>
              ) : <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="file-tray-outline" size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Nenhum dado salvo ainda.</Text><Text style={styles.emptyBody}>As tarefas adicionadas aparecem aqui automaticamente.</Text></View>}
              <Pressable onPress={() => Alert.alert('Limpar dados do app?', 'Isso remove as tarefas guardadas neste aparelho.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Limpar dados', style: 'destructive', onPress: () => void clearStorage() }])} disabled={!storedItems.length || storageBusy} style={[styles.clearButton, (!storedItems.length || storageBusy) && styles.clearButtonDisabled]} accessibilityRole="button"><Ionicons name="trash-outline" size={18} color={storedItems.length ? colors.red : colors.muted} /><Text style={[styles.clearButtonText, !storedItems.length && styles.clearButtonTextDisabled]}>Limpar dados do app</Text></Pressable>
              <Text style={styles.permissionFootnote}>Os dados ficam no armazenamento local deste aparelho.</Text>
            </View>
          )}
          <View style={styles.footer}><View style={styles.footerRule} /><Text style={styles.footerText}>APLICATIVO ALFA <Text style={styles.footerDot}>·</Text> PRIVADO NESTE APARELHO</Text></View>
        </ScrollView>

        <View style={styles.bottomNav}>{tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={styles.navItem} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={tab.label}><View style={[styles.navIconWrap, selected && styles.navIconWrapSelected]}><Ionicons name={tab.icon} size={21} color={selected ? colors.white : colors.muted} /></View><Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{tab.label}</Text></Pressable>;
        })}</View>
      </View>
    </SafeAreaView>
  );
}

const colors = { paper: '#F2F4EE', white: '#FFFFFF', ink: '#1C2B24', green: '#2E6B50', greenDark: '#1E4938', mint: '#DCEAE0', muted: '#829087', line: '#DFE5DE', orange: '#D87548', orangeLight: '#F6E5D9', blue: '#456F88', red: '#B55045' };

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper }, appShell: { flex: 1, backgroundColor: colors.paper },
  topBar: { height: 70, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: colors.white, fontFamily: 'Georgia', fontSize: 22, fontWeight: '700' }, brandTextWrap: { marginLeft: 10 }, brandName: { color: colors.ink, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 }, brandCaption: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginTop: 3 },
  datePill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.white }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.orange }, dateText: { color: colors.ink, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  scrollContent: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 32 }, pageHeading: { marginBottom: 25 }, eyebrow: { color: colors.orange, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 9 }, pageTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 32, lineHeight: 38 }, pageSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 }, contentBlock: { gap: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryCopy: { gap: 5 }, summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }, summaryTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, progressRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' }, progressNumber: { color: colors.green, fontSize: 12, fontWeight: '800' }, progressTrack: { height: 5, backgroundColor: colors.line, borderRadius: 4, overflow: 'hidden' }, progressFill: { height: 5, borderRadius: 4, backgroundColor: colors.green },
  inputRow: { flexDirection: 'row', gap: 9 }, taskInput: { flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 15, color: colors.ink, fontSize: 14 }, addButton: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green }, listHeader: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 21 }, countLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  taskRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 }, checkButton: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#B6C5B9', alignItems: 'center', justifyContent: 'center' }, checkButtonDone: { borderColor: colors.green, backgroundColor: colors.green }, taskTitle: { flex: 1, color: colors.ink, fontSize: 14 }, taskTitleDone: { color: colors.muted, textDecorationLine: 'line-through' }, removeButton: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }, emptyState: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14 }, emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }, emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, emptyBody: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 }, loader: { paddingVertical: 22 },
  bioPanel: { alignItems: 'center', padding: 22, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, bioIcon: { width: 106, height: 106, borderRadius: 36, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 17 }, bioIconSuccess: { backgroundColor: colors.green }, bioTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 21, textAlign: 'center' }, bioBody: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 18 }, primaryButton: { minHeight: 50, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.green }, primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '700' }, actionLoader: { marginVertical: 15 }, noticeBox: { width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.orangeLight, borderRadius: 10, padding: 11 }, noticeText: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 16 }, infoLine: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingHorizontal: 4 }, infoLineText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
  mapFrame: { width: '100%', height: 300, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: '#E6EDE7' }, map: { flex: 1 }, mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 }, mapTarget: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, mapEmptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, mapEmptyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 }, coordinateRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, coordinateValue: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 5 }, coordinateDivider: { width: 1, height: 31, backgroundColor: colors.line }, accuracyBadge: { marginLeft: 'auto', backgroundColor: colors.mint, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 }, accuracyText: { color: colors.greenDark, fontSize: 10, fontWeight: '700' }, permissionFootnote: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 }, errorMessage: { color: colors.red, fontSize: 12, lineHeight: 18 }, buttonDisabled: { opacity: 0.7 },
  cameraFrame: { height: 370, width: '100%', borderRadius: 15, overflow: 'hidden', backgroundColor: '#E5EAE5', borderWidth: 1, borderColor: colors.line }, cameraPreview: { width: '100%', height: '100%' }, cameraEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 }, cameraIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, cameraEmptyTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 18, lineHeight: 24, textAlign: 'center' }, cameraEmptyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, photoBadge: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 }, photoBadgeText: { color: colors.greenDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }, cameraActions: { alignItems: 'center' }, cameraCaptureButton: { maxWidth: 260 }, secondaryButton: { minHeight: 48, paddingHorizontal: 19, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  storageSummary: { minHeight: 82, flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, gap: 12 }, storageIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }, storageSummaryText: { flex: 1, gap: 4 }, storageCount: { color: colors.ink, fontSize: 19, fontWeight: '800' }, storageCountUnit: { color: colors.muted, fontSize: 11, fontWeight: '500' }, iconButton: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, storageList: { borderTopWidth: 1, borderTopColor: colors.line }, storageEntry: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 7 }, storageKey: { color: colors.green, fontSize: 11, fontWeight: '800' }, storageValue: { color: colors.ink, fontSize: 11, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, clearButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#E8C7C1', borderRadius: 11, backgroundColor: colors.white }, clearButtonDisabled: { borderColor: colors.line }, clearButtonText: { color: colors.red, fontSize: 12, fontWeight: '700' }, clearButtonTextDisabled: { color: colors.muted }, footer: { alignItems: 'center', marginTop: 34, gap: 11 }, footerRule: { width: 38, height: 2, backgroundColor: colors.orange, borderRadius: 2 }, footerText: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 }, footerDot: { color: colors.orange },
  bottomNav: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5, paddingTop: 7, paddingBottom: Platform.OS === 'ios' ? 8 : 4, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }, navItem: { minWidth: 58, alignItems: 'center', gap: 4 }, navIconWrap: { width: 37, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, navIconWrapSelected: { backgroundColor: colors.green }, navLabel: { color: colors.muted, fontSize: 9, fontWeight: '600' }, navLabelSelected: { color: colors.greenDark, fontWeight: '800' },
});
