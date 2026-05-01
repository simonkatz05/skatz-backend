const router = require('express').Router();
const requireAuth = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const c = require('./adminController');

router.use(requireAuth(['admin']));

// Students
router.get('/students', c.listStudents);
router.get('/students/:id', c.getStudent);
router.patch('/students/:id', c.updateStudent);
router.delete('/students/:id', c.deleteStudent);

// Cohorts
router.get('/cohorts', c.listCohorts);
router.post('/cohorts', c.createCohort);
router.patch('/cohorts/:id', c.updateCohort);
router.delete('/cohorts/:id', c.deleteCohort);

// Cohort × Module access
router.get('/module-access-matrix', c.getMatrix);
router.put('/cohorts/:id/modules', c.setCohortModulesHandler);
router.post('/cohorts/:id/modules/:moduleId', c.grantModuleHandler);
router.delete('/cohorts/:id/modules/:moduleId', c.revokeModuleHandler);

// Modules
router.get('/modules', c.listModules);
router.post('/modules', c.createModule);
router.patch('/modules/:id', c.updateModule);
router.delete('/modules/:id', c.deleteModule);

// Lessons (nested under module)
router.post('/modules/:id/lessons', c.createLesson);
router.patch('/modules/:id/lessons/:lessonId', c.updateLesson);
router.delete('/modules/:id/lessons/:lessonId', c.deleteLesson);

// Invite codes
router.get('/invite-codes', c.listInviteCodes);
router.post('/invite-codes', c.createInviteCodes);
router.delete('/invite-codes/:id', c.deleteInviteCode);

// Flashcard decks (Anki upload)
router.get('/decks', c.listDecks);
router.post('/decks', upload.single('file'), c.uploadDeck);
router.delete('/decks/:id', c.deleteDeck);

// Practice tests
router.get('/practice-tests', c.listPracticeTests);
router.post('/practice-tests', c.createPracticeTest);
router.post('/practice-tests/:id/passages', c.addPassage);
router.post('/practice-tests/:id/questions', c.addQuestion);
router.patch('/practice-tests/:id/questions/:questionId', c.updateQuestion);

// Classes
router.get('/classes', c.listClasses);
router.post('/classes', c.createClass);
router.patch('/classes/:id', c.updateClass);
router.delete('/classes/:id', c.deleteClass);

module.exports = router;
